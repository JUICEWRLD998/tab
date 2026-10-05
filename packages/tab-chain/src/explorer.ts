/** Explorer links. Kept in its own file with no imports so a page that only needs a link does not pull in viem. */
export const EXPLORER_URL = "https://explorer.arc.io";
export const txUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const addressUrl = (a: string) => `${EXPLORER_URL}/address/${a}`;
