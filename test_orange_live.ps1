$base = "http://localhost:8001"

# Login admin restaurant de test
$admin = Invoke-RestMethod "$base/api/v1/auth/login" -Method Post -ContentType "application/json" -Body '{"login":"paytest","password":"PayTest123!"}'
$headers = @{Authorization="Bearer $($admin.access_token)"; "Content-Type"="application/json"}
$restaurantId = $admin.user.restaurant_id
Write-Host "Admin OK - restaurant=$restaurantId" -ForegroundColor Green

# Creer une categorie menu
Write-Host "Creating menu category..." -ForegroundColor Cyan
try {
    $cat = Invoke-RestMethod "$base/api/v1/catalog/categories" -Method Post -Headers $headers -Body '{"name":"Plats","description":"Plats principaux","is_active":true}'
    $catId = $cat.id
    Write-Host "Category: $catId" -ForegroundColor Green
} catch {
    # Recuperer categorie existante
    $cats = Invoke-RestMethod "$base/api/v1/catalog/categories" -Headers $headers
    $catId = $cats[0].id
    Write-Host "Using existing category: $catId" -ForegroundColor Yellow
}

# Creer un article menu
Write-Host "Creating menu item..." -ForegroundColor Cyan
$menuItemId = $null
try {
    $item = Invoke-RestMethod "$base/api/v1/catalog/items" -Method Post -Headers $headers -Body "{`"name`":`"Poulet Braise`",`"price`":3500,`"category_id`":`"$catId`",`"is_available`":true}"
    $menuItemId = $item.id
    Write-Host "Menu item: $menuItemId price=3500 FCFA" -ForegroundColor Green
} catch {
    $items = Invoke-RestMethod "$base/api/v1/catalog/items" -Headers $headers
    $menuItemId = $items[0].id
    Write-Host "Using existing item: $menuItemId" -ForegroundColor Yellow
}

# Creer une commande via l'endpoint public (slug du restaurant)
Write-Host "Creating test order..." -ForegroundColor Cyan
$slug = "test-payment-resto"
$orderBody = "{
  `"customer_name`": `"Client Test Orange`",
  `"customer_phone`": `"690764857`",
  `"fulfillment_type`": `"Sur place`",
  `"payment_method`": `"Orange Money`",
  `"items`": [{`"menu_item_id`":`"$menuItemId`",`"quantity`":1}]
}"
try {
    $order = Invoke-RestMethod "$base/api/v1/orders/public/$slug" -Method Post -ContentType "application/json" -Body $orderBody
    $orderId = $order.id
    Write-Host "Order created: $($order.order_number) | $($order.total_amount) FCFA | id=$orderId" -ForegroundColor Green
} catch {
    Write-Host "Order creation failed: $($_.ErrorDetails.Message)" -ForegroundColor Red
    # Utiliser commande existante si dispo
    $orders = Invoke-RestMethod "$base/api/v1/orders?limit=5" -Headers $headers
    $first = $orders | Where-Object { $_.status -notin @("Payee","Payée","Annulée") } | Select-Object -First 1
    if ($first) {
        $orderId = $first.id
        Write-Host "Using existing order: $($first.order_number) | $($first.total_amount) FCFA" -ForegroundColor Yellow
    } else {
        Write-Host "No orders available for testing" -ForegroundColor Red
        exit 1
    }
}

# VRAI TEST ORANGE MONEY
Write-Host ""
Write-Host "=== INITIATING REAL ORANGE MONEY PAYMENT ===" -ForegroundColor Cyan
Write-Host "Order: $orderId | Payer: 640764857" -ForegroundColor Cyan
Write-Host ""

$initBody = "{`"order_id`":`"$orderId`",`"payer_msisdn`":`"640764857`"}"
try {
    $result = Invoke-RestMethod "$base/api/v1/payments/orange/initiate" -Method Post -Headers $headers -Body $initBody
    Write-Host "RESULT:" -ForegroundColor Green
    Write-Host "  transaction_id : $($result.transaction_id)" -ForegroundColor White
    Write-Host "  pay_token      : $($result.pay_token)" -ForegroundColor White
    Write-Host "  status         : $($result.status)" -ForegroundColor White
    Write-Host "  message        : $($result.message)" -ForegroundColor White
    if ($result.payment_url) { Write-Host "  payment_url    : $($result.payment_url)" -ForegroundColor White }

    if ($result.status -eq "PENDING") {
        Write-Host ""
        Write-Host "PAYMENT PENDING - Phone 640764857 should receive USSD prompt now" -ForegroundColor Green
        Write-Host "Polling status in 10s..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
        $status = Invoke-RestMethod "$base/api/v1/payments/orange/status/$($result.transaction_id)" -Headers $headers
        Write-Host "Status after 10s: $($status.status)" -ForegroundColor Cyan
    } elseif ($result.status -eq "SUCCESS") {
        Write-Host "PAYMENT CONFIRMED IMMEDIATELY" -ForegroundColor Green
    } elseif ($result.status -eq "FAILED") {
        Write-Host "PAYMENT FAILED: $($result.message)" -ForegroundColor Red
    }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    $detail = $_.ErrorDetails.Message
    Write-Host "HTTP $code : $detail" -ForegroundColor Red
    Write-Host ""
    if ($code -eq 502) {
        Write-Host "Diagnosis: Orange API returned an error." -ForegroundColor Yellow
        Write-Host "Check backend logs for full response:" -ForegroundColor Yellow
        Write-Host "  docker logs restaurant_saas_backend --tail 30" -ForegroundColor White
    }
}
