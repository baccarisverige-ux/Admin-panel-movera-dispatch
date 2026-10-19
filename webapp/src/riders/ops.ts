import { NOTE_MAX } from "../domain/labels.ts";

export type RiderPrivacyState = "none" | "new" | "processing" | "done";

export type RiderWalletEntry = {
  id: string;
  at: string;
  kind: "credit" | "debit" | "refund" | "voucher";
  amountOre: number;
  balanceOre: number;
  actorId: string;
  reason: string;
};

export type RiderPromotion = {
  code: string;
  label: string;
  status: "active" | "used" | "expired";
  addedAt: string;
  actorId: string;
};

export type RiderSession = {
  id: string;
  platform: "ios" | "android" | "web";
  device: string;
  lastSeenAt: string;
  active: boolean;
};

export type SavedPlace = {
  id: string;
  label: string;
  address: string;
};

export type RiderOps = {
  riderId: string;
  walletOre: number;
  wallet: RiderWalletEntry[];
  promotions: RiderPromotion[];
  sessions: RiderSession[];
  privacy: RiderPrivacyState;
  privateNote: string;
  savedPlaces: SavedPlace[];
  accountReason: string;
  activity: string[];
};

export type RiderOpsBook = {
  draftRev: number;
  riders: Record<string, RiderOps>;
};

export type RiderSeed = {
  id: string;
  name: string;
  status: string;
  tripId?: string;
  fareOre?: number;
};

export const RIDER_CREDIT_LIMIT_ORE = 50_000;

export function emptyRiderOpsBook(): RiderOpsBook {
  return { draftRev: 1, riders: {} };
}

function defaultSessions(id: string): RiderSession[] {
  const suffix = Number(id.replace(/\D/g, "")) || 1;
  return [
    {
      id: `${id}-ios`,
      platform: "ios",
      device: "iPhone",
      lastSeenAt: "2026-10-05T21:10:00.000Z",
      active: true,
    },
    {
      id: `${id}-secondary`,
      platform: suffix % 2 === 0 ? "web" : "android",
      device: suffix % 2 === 0 ? "Safari" : "Android phone",
      lastSeenAt: "2026-10-03T14:20:00.000Z",
      active: suffix % 3 !== 0,
    },
  ];
}

export function riderOps(book: RiderOpsBook, rider: RiderSeed): RiderOps {
  const stored = book.riders[rider.id];
  if (stored) return stored;
  return {
    riderId: rider.id,
    walletOre: rider.fareOre ?? 0,
    wallet: [],
    promotions: [],
    sessions: defaultSessions(rider.id),
    privacy: rider.status === "privacy" ? "processing" : "none",
    privateNote: "",
    savedPlaces: [],
    accountReason: "",
    activity: [`Rider profile available for ${rider.name}`],
  };
}

function withRider(book: RiderOpsBook, rider: RiderSeed, next: RiderOps): RiderOpsBook {
  return {
    ...book,
    draftRev: book.draftRev + 1,
    riders: { ...book.riders, [rider.id]: next },
  };
}

function activity(current: RiderOps, line: string): string[] {
  return [line, ...current.activity].slice(0, 40);
}

export function creditRiderWallet(
  book: RiderOpsBook,
  rider: RiderSeed,
  amountOre: number,
  actorId: string,
  reason: string,
): { book: RiderOpsBook; error?: string } {
  if (!Number.isFinite(amountOre) || amountOre <= 0 || amountOre > RIDER_CREDIT_LIMIT_ORE) {
    return { book, error: "Credit must be between 1 öre and 500 kr." };
  }
  if (!reason.trim()) return { book, error: "A reason is required." };
  const current = riderOps(book, rider);
  const balanceOre = current.walletOre + Math.round(amountOre);
  const entry: RiderWalletEntry = {
    id: `${rider.id}-wallet-${current.wallet.length + 1}`,
    at: new Date().toISOString(),
    kind: "credit",
    amountOre: Math.round(amountOre),
    balanceOre,
    actorId,
    reason: reason.trim(),
  };
  return {
    book: withRider(book, rider, {
      ...current,
      walletOre: balanceOre,
      wallet: [entry, ...current.wallet],
      activity: activity(current, `Wallet credited ${Math.round(amountOre)} öre by ${actorId}`),
    }),
  };
}

export function revokeRiderSessions(book: RiderOpsBook, rider: RiderSeed, actorId: string): RiderOpsBook {
  const current = riderOps(book, rider);
  return withRider(book, rider, {
    ...current,
    sessions: current.sessions.map((session) => ({ ...session, active: false })),
    activity: activity(current, `All rider sessions revoked by ${actorId}`),
  });
}

export function advanceRiderPrivacy(book: RiderOpsBook, rider: RiderSeed, actorId: string): RiderOpsBook {
  const current = riderOps(book, rider);
  const next: RiderPrivacyState =
    current.privacy === "none" || current.privacy === "new"
      ? "processing"
      : current.privacy === "processing"
        ? "done"
        : "done";
  return withRider(book, rider, {
    ...current,
    privacy: next,
    activity: activity(current, `Privacy request moved to ${next} by ${actorId}`),
  });
}

export function setRiderNote(book: RiderOpsBook, rider: RiderSeed, note: string, actorId: string): RiderOpsBook {
  const current = riderOps(book, rider);
  return withRider(book, rider, {
    ...current,
    privateNote: note.trim().slice(0, NOTE_MAX),
    activity: activity(current, `Private note updated by ${actorId}`),
  });
}

export function setRiderAccountReason(book: RiderOpsBook, rider: RiderSeed, status: string, reason: string, actorId: string): RiderOpsBook {
  const current = riderOps(book, rider);
  return withRider(book, rider, {
    ...current,
    accountReason: reason.trim(),
    activity: activity(current, `Account changed to ${status} by ${actorId}: ${reason.trim()}`),
  });
}

export function addRiderPromotion(
  book: RiderOpsBook,
  rider: RiderSeed,
  code: string,
  label: string,
  actorId: string,
): { book: RiderOpsBook; error?: string } {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return { book, error: "Promotion code is required." };
  const current = riderOps(book, rider);
  if (current.promotions.some((item) => item.code === normalized && item.status === "active")) {
    return { book, error: "That promotion is already active." };
  }
  const promo: RiderPromotion = {
    code: normalized,
    label: label.trim() || normalized,
    status: "active",
    addedAt: new Date().toISOString(),
    actorId,
  };
  return {
    book: withRider(book, rider, {
      ...current,
      promotions: [promo, ...current.promotions],
      activity: activity(current, `Promotion ${normalized} added by ${actorId}`),
    }),
  };
}

export function removeRiderPromotion(book: RiderOpsBook, rider: RiderSeed, code: string, actorId: string): RiderOpsBook {
  const current = riderOps(book, rider);
  return withRider(book, rider, {
    ...current,
    promotions: current.promotions.map((item) => item.code === code ? { ...item, status: "expired" } : item),
    activity: activity(current, `Promotion ${code} removed by ${actorId}`),
  });
}
