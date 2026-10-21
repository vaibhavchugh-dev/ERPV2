/** Carrier tracking page for a shipment, matching the Track action on the shipment detail. */
export function getShipmentTrackingUrl(
  courier: string | undefined | null,
  trackingNumber: string | undefined | null
): string | null {
  const tracking = (trackingNumber || "").trim();
  if (!tracking) return null;

  const courierLower = (courier || "").toLowerCase();
  const encoded = encodeURIComponent(tracking);

  if (courierLower.includes("fedex")) {
    return `https://www.fedex.com/en-us/tracking.html?tracknumbers=${encoded}`;
  }
  if (courierLower.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encoded}`;
  }
  if (courierLower.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tRef=fullpage&tLc=2&text28777=&tLabels=${encoded}`;
  }
  if (courierLower.includes("dhl")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${encoded}`;
  }

  return null;
}
