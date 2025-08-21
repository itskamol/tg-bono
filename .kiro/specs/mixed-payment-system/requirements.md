# Requirements Document

## Introduction

Bu funksiya buyurtma uchun aralash to'lov tizimini amalga oshiradi. Mijozlar bir buyurtma uchun turli xil to'lov usullarini (naqd, karta, kredit) kombinatsiya qilib ishlatishi mumkin. Masalan, qismini naqd, qolganini karta orqali to'lashi mumkin.

## Requirements

### Requirement 1

**User Story:** Kassir sifatida, men mijozning buyurtmasini turli xil to'lov usullari bilan to'lashiga imkon berishni xohlayman, shunda mijoz o'ziga qulay bo'lgan usulda to'lov qilishi mumkin.

#### Acceptance Criteria

1. WHEN kassir to'lov bosqichiga kelganda THEN tizim birinchi to'lov turini tanlash imkoniyatini taklif qilishi KERAK
2. WHEN kassir to'lov turini tanlaganda THEN tizim to'lov miqdorini kiritish yoki "Hammasini" tugmasini ko'rsatishi KERAK
3. WHEN kassir "Hammasini" tugmasini bosganda THEN tizim butun summani shu to'lov turiga belgilashi KERAK
4. WHEN kassir qisman miqdor kiritganda THEN tizim qolgan summa uchun yana to'lov turi tanlash imkoniyatini berishi KERAK
5. WHEN barcha summa to'langan bo'lganda THEN tizim buyurtmani tasdiqlash imkoniyatini berishi KERAK

### Requirement 2

**User Story:** Kassir sifatida, men to'lov jarayonida xatolik qilsam, orqaga qaytib o'zgartirishlar kiritishni xohlayman.

#### Acceptance Criteria

1. WHEN kassir to'lov miqdorini kiritayotganda THEN tizim "Orqaga" tugmasini ko'rsatishi KERAK
2. WHEN kassir "Orqaga" tugmasini bosganda THEN tizim oldingi to'lov bosqichiga qaytishi KERAK
3. WHEN kassir to'lov turini o'zgartirishni xohlaganda THEN tizim avvalgi to'lovlarni bekor qilish imkoniyatini berishi KERAK

### Requirement 3

**User Story:** Kassir sifatida, men to'lov jarayonida qancha pul qolganligini ko'rishni xohlayman, shunda xatolik qilmasligim mumkin.

#### Acceptance Criteria

1. WHEN kassir to'lov miqdorini kiritayotganda THEN tizim jami summa va qolgan summani ko'rsatishi KERAK
2. WHEN kassir noto'g'ri miqdor kiritganda THEN tizim xatolik xabarini ko'rsatishi KERAK
3. WHEN kassir qolgan summadan ko'p miqdor kiritganda THEN tizim ogohlantirishni ko'rsatishi KERAK

### Requirement 4

**User Story:** Tizim administratori sifatida, men har bir buyurtmada qanday to'lov turlari ishlatilganligini ko'rishni xohlayman, hisobot va audit uchun.

#### Acceptance Criteria

1. WHEN buyurtma yaratilganda THEN tizim har bir to'lov turini alohida yozuvda saqlashi KERAK
2. WHEN buyurtma ko'rilganda THEN tizim barcha to'lov turlarini va miqdorlarini ko'rsatishi KERAK
3. WHEN hisobot tayyorlanayotganda THEN tizim to'lov turlari bo'yicha statistikani berishi KERAK

### Requirement 5

**User Story:** Kassir sifatida, men to'lov jarayonini bekor qilib, buyurtmani o'chirishni xohlayman, agar mijoz buyurtmani rad etsa.

#### Acceptance Criteria

1. WHEN kassir to'lov jarayonida bo'lganda THEN tizim "Bekor qilish" tugmasini ko'rsatishi KERAK
2. WHEN kassir "Bekor qilish" tugmasini bosganda THEN tizim tasdiqlash so'rashi KERAK
3. WHEN kassir bekor qilishni tasdiqlasa THEN tizim buyurtmani o'chirib, bosh menyuga qaytishi KERAK