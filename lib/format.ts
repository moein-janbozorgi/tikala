export const toman = (n: number) => `${n.toLocaleString("fa-IR")} تومان`;

export const ORDER_STATUSES: Record<string, string> = {
  awaiting_payment: "در انتظار پرداخت",
  pending: "در انتظار بررسی",
  processing: "در حال آماده‌سازی",
  shipped: "ارسال شده",
  delivered: "تحویل شده",
  cancelled: "لغو شده",
};

export const date = (sqlite: string) => new Date(sqlite.replace(" ", "T") + "Z").toLocaleDateString("fa-IR");
