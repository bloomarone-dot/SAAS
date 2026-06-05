
from app.modules.payments.orange_service import initiate_cashin, OrangePaymentError
from fastapi import HTTPException


async def initiate_om_payment(amount: float, phone_number: str, order_number: str) -> dict:
    """
    Wrapper de compatibilité pour initier un paiement Orange Money.
    Délègue à payments.orange_service.initiate_cashin.
    """
    try:
        return await initiate_cashin(
            amount=int(amount),
            payer_msisdn=phone_number,
            order_ref=order_number,
            description=f"Commande {order_number}",
        )
    except OrangePaymentError as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Orange Money: {exc}")
