export type Domain =
  | "arcanelayer"
  | "aiteam"
  | "joshowensdev"
  | "infrastructure"
  | "wendyowensbooks"

export const DOMAIN_ORDER = [
  "arcanelayer",
  "aiteam",
  "joshowensdev",
  "infrastructure",
  "wendyowensbooks",
] as const

export const DOMAIN_LABELS: Record<Domain, string> = {
  arcanelayer: "Arcane Layer",
  aiteam: "AI Team",
  joshowensdev: "joshowens.dev",
  infrastructure: "Infrastructure",
  wendyowensbooks: "Wendy Owens Books",
}
