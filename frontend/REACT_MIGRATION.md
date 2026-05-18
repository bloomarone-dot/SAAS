# Migration Next.js -> ReactJS

Ce package contient :

- structure ReactJS pure
- suppression des dépendances Next.js principales
- préparation Vite
- conversion de plusieurs imports Next.js
- architecture offline-ready

## Installation

npm install

npm run dev

## Remplacements effectués

- next/link -> react-router-dom
- suppression next/navigation
- suppression next/image
- structure Vite ajoutée

## Important

Certaines pages complexes Next.js devront être adaptées manuellement :
- server actions
- middleware
- API routes
- App Router