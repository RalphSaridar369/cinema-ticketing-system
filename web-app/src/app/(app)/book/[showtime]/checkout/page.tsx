import { Suspense } from "react";
import { Checkout } from "@/components/screens/checkout";
import { ScreenFallback } from "@/components/ui";

export default function CheckoutPage({ params, searchParams }: PageProps<"/book/[showtime]/checkout">) {
  return (
    <Suspense fallback={<ScreenFallback />}>
      <Checkout params={params} searchParams={searchParams} />
    </Suspense>
  );
}
