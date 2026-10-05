import { makePublicClient } from "@tab/chain";
import type { PublicClient } from "viem";

/** One shared public client for every screen. Reads are retried and fall back inside @tab/chain. */
export const pub: PublicClient = makePublicClient();
