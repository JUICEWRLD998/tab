import { makePublicClient } from "@tab/chain";

/** One shared public client for every screen. Reads are retried and fall back inside @tab/chain. */
export const pub = makePublicClient();
