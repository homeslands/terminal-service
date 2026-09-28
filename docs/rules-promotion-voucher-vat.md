# Quy tắc tính giá: Promotion + Voucher + VAT

> Tài liệu giải thích logic tính giá khi đơn có cả khuyến mãi (promotion), mã giảm giá (voucher) và VAT. Dùng từ đơn giản, có ví dụ cụ thể.

## 1. Các loại voucher

| Loại voucher | Ý nghĩa | Ví dụ |
|---|---|---|
| **Giảm phần trăm** (`%`) | Trừ X% giá trị | -20% |
| **Giảm tiền cố định** (trừ tiền) | Trừ X đồng | -10.000đ |
| **Đồng giá** | Cố định 1 mức giá cho món áp dụng | 30.000đ/món |

## 2. Phạm vi áp dụng (applicability)

| Phạm vi | Ý nghĩa |
|---|---|
| **Tất cả phải có** (`ALL_REQUIRED`) | Tất cả món trong giỏ phải nằm trong danh sách voucher → voucher áp lên TỔNG đơn |
| **Ít nhất 1 món** (`AT_LEAST_ONE_REQUIRED`) | Chỉ cần 1 món hợp lệ → voucher áp lên TỪNG MÓN eligible |

## 3. VAT là gì

- **VAT** (thuế giá trị gia tăng) = `vatRate` cài ở từng sản phẩm
- Tính theo từng món riêng: `VAT của món = giá sau giảm × vatRate%`
- VAT cộng vào tổng tiền sau cùng

## 4. Các nguyên tắc cố định

| Nguyên tắc | Áp dụng |
|---|---|
| VAT của sản phẩm = 0 | Không cộng VAT vào subtotal |
| VAT của sản phẩm > 0 | Cộng VAT vào subtotal sau khi áp giảm giá |
| Sau khi đặt món xong, nếu admin update VAT hoặc voucher | **Giữ nguyên** giá trị cũ trên đơn |
| Làm tròn số tiền | 5 và trên 5 làm tròn lên (ví dụ 59112,5 → 59113) |

## 5. Quy tắc tính giá theo từng case

> Mỗi case là 1 tổ hợp: loại voucher × phạm vi × có/không promotion.

### 5.1 Không có voucher

| Có promotion? | Thứ tự áp dụng |
|---|---|
| ❌ Không | Giá gốc → VAT |
| ✅ Có | Promotion → VAT |

**Ví dụ**: Món A 100k, promotion -20%, VAT 10%
```
100k × 0.8 (promo) = 80k
80k × 1.1 (VAT)    = 88k khách trả
```

### 5.2 Voucher % (giảm phần trăm)

#### Phạm vi: **Tất cả phải có** (ALL_REQUIRED)

| Có promotion? | Thứ tự áp dụng |
|---|---|
| ❌ Không | Voucher → VAT |
| ✅ Có | Promotion → Voucher → VAT |

**Ví dụ 1** (không promotion): Món A 100k + Món B 50k (VAT 10%), voucher -30% ALL
```
A: 100k × 0.7 = 70k
B: 50k × 0.7  = 35k → +VAT 10% = 38.5k
Khách trả: 70k + 38.5k = 108.5k
```

**Ví dụ 2** (có promotion): Món A 100k (promo -15%), voucher -20% ALL, VAT 10%
```
100k × 0.85 (promo)   = 85k
85k × 0.80 (voucher)  = 68k
68k × 1.10 (VAT)      = 74.8k khách trả
```

#### Phạm vi: **Ít nhất 1 món** (AT_LEAST_ONE)

| Có promotion? | Thứ tự áp dụng |
|---|---|
| ❌ Không | Voucher → VAT |
| ✅ Có | **Bỏ qua promotion** → Voucher → VAT |

> ⚠️ Voucher % AT_LEAST_ONE **đè** lên promotion trên món eligible. Khuyến mãi 15% không có tác dụng.

**Ví dụ**: Món BBQ 50k (promo -15%, voucher -10% AT_LEAST eligible, VAT 10%)
```
50k (giá gốc, drop promo) × 0.9 (voucher) = 45k
45k × 1.10 (VAT)                          = 49.5k khách trả
```

---

### 5.3 Voucher Trừ tiền cố định (FIXED_VALUE)

#### Phạm vi: **Tất cả phải có** (ALL_REQUIRED)

| Có promotion? | Thứ tự áp dụng |
|---|---|
| ❌ Không | VAT → Trừ tiền |
| ✅ Có | Promotion → VAT → Trừ tiền |

> Khác voucher %: Trừ tiền tính sau VAT.

**Ví dụ 1** (không promotion): Tổng 100k (VAT 10%), voucher -10.000đ ALL
```
100k × 1.10 (VAT)    = 110k
110k - 10k (voucher) = 100k khách trả
```

**Ví dụ 2** (có promotion): Món 100k (promo -20%), voucher -5.000đ ALL, VAT 10%
```
100k × 0.80 (promo)  = 80k
80k × 1.10 (VAT)     = 88k
88k - 5k (voucher)   = 83k khách trả
```

#### Phạm vi: **Ít nhất 1 món** (AT_LEAST_ONE)

| Có promotion? | Thứ tự áp dụng |
|---|---|
| ❌ Không | **Bỏ qua promotion** → Trừ tiền → VAT |
| ✅ Có | **Bỏ qua promotion** → Trừ tiền → VAT |

> ⚠️ Voucher Trừ tiền AT_LEAST_ONE cũng **đè** lên promotion.

**Ví dụ**: Món BBQ 50k (promo -15%), voucher -2.000đ AT_LEAST eligible, VAT 10%
```
50k (giá gốc, drop promo) - 2.000đ (voucher) = 48k
48k × 1.10 (VAT)                             = 52.8k khách trả
```

---

### 5.4 Voucher Đồng giá (SAME_PRICE_PRODUCT)

Áp dụng riêng cho từng món eligible — **luôn bỏ qua promotion**.

| Trường hợp | Thứ tự |
|---|---|
| Món eligible (có trong danh sách voucher) | **Bỏ qua promotion** → Áp giá voucher → VAT |
| Món không eligible | Như "không có voucher" |

**Ví dụ**: Voucher đồng giá BBQ = 30.000đ (BBQ catalog 50k, promo -15%, VAT 10%)
```
BBQ: 30k (đồng giá, drop promo) × 1.10 (VAT) = 33k khách trả
```

---

## 6. Bảng tổng kết nhanh

| Voucher Type | Phạm vi | Có promo? | Drop promo? | Thứ tự áp dụng |
|---|---|---|---|---|
| Không có | — | ❌ | — | Giá → VAT |
| Không có | — | ✅ | ❌ | Promo → VAT |
| **%** | ALL | ❌ | ❌ | Voucher → VAT |
| **%** | ALL | ✅ | ❌ | Promo → Voucher → VAT |
| **%** | AT_LEAST eligible | ❌ | — | Voucher → VAT |
| **%** | AT_LEAST eligible | ✅ | ✅ | (drop promo) → Voucher → VAT |
| **Trừ tiền** | ALL | ❌ | ❌ | VAT → Trừ tiền |
| **Trừ tiền** | ALL | ✅ | ❌ | Promo → VAT → Trừ tiền |
| **Trừ tiền** | AT_LEAST eligible | ❌ | — | (drop promo) → Trừ tiền → VAT |
| **Trừ tiền** | AT_LEAST eligible | ✅ | ✅ | (drop promo) → Trừ tiền → VAT |
| **Đồng giá** | (auto AT_LEAST) eligible | ❌ | — | Áp giá voucher → VAT |
| **Đồng giá** | (auto AT_LEAST) eligible | ✅ | ✅ | (drop promo) → Áp giá voucher → VAT |

## 7. Quy tắc nhớ ngắn

1. **Voucher %**: tính trước VAT (multiplicative chain)
2. **Voucher Trừ tiền ALL**: tính sau VAT (trừ tổng cuối)
3. **Voucher Trừ tiền AT_LEAST**: tính trước VAT (per-item)
4. **AT_LEAST + Đồng giá**: luôn drop promotion trên món eligible
5. **ALL**: luôn GIỮ promotion (tính trước voucher)
6. **VAT**: luôn tính sau cùng (trừ case voucher trừ tiền ALL_REQUIRED)
7. **Làm tròn**: phần thập phân ≥ 0.5 → làm tròn lên

## 8. Hiển thị trên bill

### 8.1 Hoá đơn tạm (trước thanh toán)
- Item: hiển thị giá gốc + số lượng + thành tiền (đã trừ giảm + VAT)
- Tổng đơn breakdown: Tạm tính → Giảm KM → Voucher → Tạm tính sau giảm → VAT → Tổng

### 8.2 Hoá đơn VAT chính thức
- "Đơn giá" trên hoá đơn = giá đã trừ voucher (chưa cộng VAT)
- "Thành tiền" = đơn giá × số lượng
- "Cộng tiền hàng" = subtotal sau giảm, trước VAT
- "Thuế GTGT" = tổng VAT
- "Tổng cộng thanh toán" = khách trả

### 8.3 Quy tắc gạch đỏ giá item
- **Gạch đỏ giá gốc**: chỉ khi voucher đang giảm trực tiếp lên món đó (`AT_LEAST_ONE` eligible hoặc `SAME_PRICE` eligible)
- **Không gạch**: nếu chỉ có promotion (không có voucher), hoặc voucher `ALL_REQUIRED` (giảm trên tổng đơn, không phân về item)

## 9. Trường hợp đặc biệt

### 9.1 Update sau khi đặt
- Update VAT hoặc voucher sau khi đặt món → **giữ nguyên** giá trị cũ trên đơn đó.
- Chỉ ảnh hưởng đơn mới đặt sau khi update.

### 9.2 Đơn có món mix VAT (món 0% + món 10%)
- Tính VAT riêng cho từng món theo vatRate của món đó
- Tổng VAT = sum VAT của từng món
- Voucher % áp lên tổng (cả phần có VAT lẫn không)
- Voucher Trừ tiền AT_LEAST → trừ trên từng món eligible

### 9.3 Custom-price item
- Không apply promotion
- Không apply voucher
- Subtotal = customPrice × qty (+ VAT nếu có vatRate)

## 10. Bug đã biết / pending fix

| Case | Vấn đề | Trạng thái |
|---|---|---|
| 17 (FIXED AT_LEAST + promo) | BE không tính accumulated points + temp bill bị mất | Pending BE |
| 7 (% ALL) | Tester báo BE bill sai khi voucher % + VAT mix items | Pending BE |

---

> **Tài liệu này dựa trên test matrix của QA (cases 1-24). Cập nhật khi BE thay đổi logic.**
