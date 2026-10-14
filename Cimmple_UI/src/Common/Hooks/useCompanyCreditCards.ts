import { useState, useEffect, useCallback } from "react";
import { VendorInvoiceService, PaymentCreditCard } from "../Services/VendorInvoiceService";

export function getCreditCardDisplayName(card: PaymentCreditCard): string {
  const name = card.nickName || card.cardType || "Credit Card";
  return card.lastFourDigits ? `${name} (••••${card.lastFourDigits})` : name;
}

function pickDefaultCardId(cards: PaymentCreditCard[]): number {
  if (!cards.length) return 0;
  const primary = cards.find((c) => c.isPrimary);
  return primary?.id ?? cards[0].id;
}

/**
 * Loads active company credit cards for vendor payment forms.
 * Pass enabled=false to skip the request until the user picks Credit Card.
 */
export function useCompanyCreditCards(enabled: boolean = true) {
  const [cards, setCards] = useState<PaymentCreditCard[]>([]);
  const [creditCardId, setCreditCardId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const loadCards = useCallback(async () => {
    setLoading(true);
    try {
      const list = await VendorInvoiceService.GetPaymentCreditCards();
      setCards(list);
      setCreditCardId((current) => {
        if (current && list.some((c) => c.id === current)) return current;
        return pickDefaultCardId(list);
      });
    } catch (error) {
      console.error("Error loading company credit cards:", error);
      setCards([]);
      setCreditCardId(0);
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (enabled && !loaded) {
      loadCards();
    }
  }, [enabled, loaded, loadCards]);

  return { cards, creditCardId, setCreditCardId, loading, reload: loadCards };
}
