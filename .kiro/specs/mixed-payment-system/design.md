# Design Document

## Overview

Aralash to'lov tizimi mijozlarga bir buyurtma uchun turli xil to'lov usullarini kombinatsiya qilib ishlatish imkoniyatini beradi. Hozirgi tizimda har bir buyurtma faqat bitta to'lov turiga ega, lekin yangi tizimda bir buyurtma bir nechta to'lov yozuvlariga ega bo'lishi mumkin.

## Architecture

### Database Schema Changes

Hozirgi `Order` modelida `payment_type` va `total_amount` maydonlari mavjud. Aralash to'lov uchun yangi `Payment` modelini yaratamiz:

```prisma
model Payment {
  id           String      @id @default(auto()) @map("_id") @db.ObjectId
  order        Order       @relation(fields: [order_id], references: [id])
  order_id     String      @db.ObjectId
  payment_type PaymentType
  amount       Float
  created_at   DateTime    @default(now())
}

model Order {
  // ... existing fields
  payments     Payment[]   // yangi relation
  // payment_type va total_amount maydonlarini olib tashlaymiz
}
```

### State Management

`NewOrderSceneState` interface'iga yangi maydonlar qo'shamiz:

```typescript
interface NewOrderSceneState {
  // ... existing fields
  payments?: PaymentEntry[];
  currentPayment?: PaymentEntry;
  remainingAmount?: number;
  awaitingPaymentAmount?: boolean;
}

interface PaymentEntry {
  type: PaymentType;
  amount: number;
}
```

## Components and Interfaces

### 1. Payment Flow Controller
To'lov jarayonini boshqaruvchi komponent:
- To'lov turini tanlash
- Miqdor kiritish yoki "Hammasini" tanlash
- Qolgan summa hisobini yuritish
- Keyingi to'lov turi uchun takrorlash

### 2. Payment Validation Service
To'lov ma'lumotlarini tekshiruvchi servis:
- Kiritilgan miqdor to'g'riligini tekshirish
- Jami summa mos kelishini tekshirish
- Manfiy yoki nol qiymatlarni rad etish

### 3. Payment Display Component
To'lov ma'lumotlarini ko'rsatuvchi komponent:
- Joriy to'lovlar ro'yxati
- Qolgan summa
- Jami summa

## Data Models

### PaymentEntry Model
```typescript
interface PaymentEntry {
  type: PaymentType;
  amount: number;
}
```

### Enhanced NewOrderSceneState
```typescript
interface NewOrderSceneState {
  products: any[];
  currentProduct: any;
  newProduct?: any;
  clientName?: string;
  clientPhone?: string | null;
  clientBirthday?: Date | null;
  birthdaySkipped?: boolean;
  phoneSkipped?: boolean;
  awaitingNewProductName?: boolean;
  awaitingNewProductPrice?: boolean;
  totalAmount?: number;
  
  // Yangi to'lov maydonlari
  payments?: PaymentEntry[];
  currentPayment?: PaymentEntry;
  remainingAmount?: number;
  awaitingPaymentAmount?: boolean;
}
```

## Error Handling

### 1. Invalid Amount Errors
- Manfiy yoki nol miqdor kiritilganda
- Qolgan summadan ko'p miqdor kiritilganda
- Noto'g'ri raqam formatida kiritilganda

### 2. Payment Completion Errors
- Barcha summa to'lanmagan holda tasdiqlashga urinilganda
- Database'ga saqlashda xatolik yuz berganda

### 3. Navigation Errors
- Noto'g'ri holat o'tishlarida
- Scene state buzilganda

## Testing Strategy

### 1. Unit Tests
- PaymentEntry model validation
- Payment calculation logic
- State transitions

### 2. Integration Tests
- Database operations with multiple payments
- Scene flow with mixed payments
- Error handling scenarios

### 3. User Flow Tests
- Complete mixed payment scenario
- Back navigation functionality
- Cancel payment functionality

## Implementation Flow

### 1. Payment Selection Phase
```
[To'lov] -> [Naqd/Karta/Kredit tanlash] -> [Miqdor/Hammasini]
```

### 2. Amount Input Phase
```
[Miqdor kiritish] -> [Validation] -> [Qolgan summa tekshirish]
```

### 3. Continue or Complete Phase
```
[Qolgan summa > 0] -> [Yana to'lov qo'shish]
[Qolgan summa = 0] -> [Tasdiqlash]
```

### 4. Database Operations
```
Order yaratish -> Payment yozuvlarini yaratish -> Tasdiqlash
```

## User Interface Flow

### Payment Type Selection
```
💰 Buyurtma jami: 50000 so'm
📦 Mahsulotlar: [ro'yxat]

💳 To'lov turini tanlang:
[💵 Naqd] [💳 Karta] [🏦 Kredit]
[🔙 Orqaga] [❌ Bekor]
```

### Amount Selection
```
💳 Karta to'lov tanlandi
💰 Jami: 50000 so'm

Miqdorni tanlang:
[💯 Hammasini (50000)] 
[✏️ Boshqa miqdor]
[🔙 Orqaga] [❌ Bekor]
```

### Amount Input
```
💳 Karta to'lov
💰 Jami: 50000 so'm

Miqdorni kiriting (1-50000):
[Text input expected]
```

### Payment Summary
```
✅ To'lov qo'shildi!

📋 Joriy to'lovlar:
1. 💳 Karta: 30000 so'm
💰 Qolgan: 20000 so'm

[➕ Yana to'lov] [✅ Tasdiqlash]
[🔙 Orqaga] [❌ Bekor]
```