import { after, type NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { errorParam } from "@/lib/validation";
import { notifyOrder } from "@/lib/sms";
import { confirmPayment } from "@/lib/zarinpal";

// Zarinpal sends the customer back here with ?Authority=...&Status=OK|NOK; lib/zarinpal.ts checks it with Zarinpal.
export async function GET(req: NextRequest) {
  const { orderId, error, notify } = await confirmPayment(req.nextUrl.searchParams.get("Authority") ?? "", req.nextUrl.searchParams.get("Status"));
  if (!orderId) redirect(`/account?error=${errorParam(error)}`);
  if (notify) after(() => notifyOrder(orderId, notify));
  redirect(`/account?order=${orderId}&${error ? `error=${errorParam(error)}` : "paid=1"}`);
}
