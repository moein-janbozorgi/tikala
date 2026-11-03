export const toman = (n: number) => `${n.toLocaleString("fa-IR")} تومان`;

/** Shipping in toman: free from 5,000,000 toman of goods, otherwise 85,000. */
export const FREE_SHIPPING_FROM = 5_000_000;
export const shippingCost = (subtotal: number) => (subtotal >= FREE_SHIPPING_FROM ? 0 : 85_000);

export const PROVINCES = [
  "آذربایجان شرقی", "آذربایجان غربی", "اردبیل", "اصفهان", "البرز", "ایلام", "بوشهر", "تهران", "چهارمحال و بختیاری",
  "خراسان جنوبی", "خراسان رضوی", "خراسان شمالی", "خوزستان", "زنجان", "سمنان", "سیستان و بلوچستان", "فارس", "قزوین",
  "قم", "کردستان", "کرمان", "کرمانشاه", "کهگیلویه و بویراحمد", "گلستان", "گیلان", "لرستان", "مازندران", "مرکزی",
  "هرمزگان", "همدان", "یزد",
];

export const ORDER_STATUSES: Record<string, string> = {
  awaiting_payment: "در انتظار پرداخت",
  pending: "در انتظار بررسی",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  cancelled: "لغو شده",
};

export const date = (sqlite: string) => new Date(sqlite.replace(" ", "T") + "Z").toLocaleDateString("fa-IR");
