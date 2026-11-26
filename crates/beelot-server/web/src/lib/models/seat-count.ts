// How many seats play a variant: four, and two in Klaberjass (US-219).
export const seatCountOf = (variant: string): number => (variant === "KLABERJASS" ? 2 : 4);
