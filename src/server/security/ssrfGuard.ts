import net from "node:net";
import { SERVER_CONFIG } from "../config.js";

function isPrivateOrReservedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a = 0, b = 0] = parts;

  if (a === 0 || a === 10 || a === 127) return true; // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8
  if (a === 169 && b === 254) return true; // Cloud metadata & link-local 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  if (a >= 224) return true; // Multicast & reserved

  return false;
}

function isPrivateOrReservedIpv6(rawHost: string): boolean {
  const normalized = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // Unique local fc00::/7
  if (normalized.startsWith("fe80")) return true; // Link-local fe80::/10

  // Cek IPv4-mapped IPv6 seperti ::ffff:127.0.0.1 atau ::ffff:169.254.169.254
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    if (net.isIPv4(mappedIpv4)) {
      return isPrivateOrReservedIpv4(mappedIpv4);
    }
    return true;
  }

  return false;
}

export function isSafeAllowedStreamUrl(
  rawUrl: string,
  enforceAllowlist = false
): boolean {
  if (!rawUrl || typeof rawUrl !== "string") return false;

  try {
    const parsed = new URL(rawUrl);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }

    // Tolak kredensial di dalam URL (user:pass@host)
    if (parsed.username || parsed.password) {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    const bareHost = host.replace(/^\[|\]$/g, "");

    if (
      bareHost === "localhost" ||
      bareHost.endsWith(".localhost") ||
      bareHost.endsWith(".local") ||
      bareHost.endsWith(".internal")
    ) {
      return false;
    }

    // Tolak representasi IP integer atau oktal seperti http://2130706433 atau http://0177.0.0.1
    if (/^(0x[0-9a-f]+|\d+)$/i.test(bareHost)) {
      return false;
    }
    if (/^\d+\.\d+\.\d+\.\d+$/.test(bareHost) && !net.isIPv4(bareHost)) {
      return false;
    }

    if (net.isIPv4(bareHost) && isPrivateOrReservedIpv4(bareHost)) {
      return false;
    }

    if ((net.isIPv6(bareHost) || host.startsWith("[")) && isPrivateOrReservedIpv6(bareHost)) {
      return false;
    }

    if (enforceAllowlist && SERVER_CONFIG.allowedStreamHosts.size > 0) {
      const allowed = [...SERVER_CONFIG.allowedStreamHosts].some(
        (domain) => bareHost === domain || bareHost.endsWith(`.${domain}`)
      );
      if (!allowed) return false;
    }

    return true;
  } catch {
    return false;
  }
}
