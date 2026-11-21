import "server-only";
import os from "node:os";

// Network adapters that are not the Wi-Fi or cable a phone could reach (virtual machines, containers, VPNs).
const VIRTUAL = /vmware|virtualbox|vboxnet|vethernet|hyper-v|wsl|docker|^br-|loopback|bluetooth|tailscale|zerotier|vpn|tap-|utun/i;
const PREFERRED = /wi-?fi|wlan|wlp|wireless|^en\d|^eth|ethernet/i;
const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/**
 * This machine's private-network IPv4 addresses, Wi-Fi and cable first. A phone on the same network can
 * reach the laptop at one of these, which "localhost" never is.
 */
export function lanAddresses(): string[] {
  const found: { name: string; address: string }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal && PRIVATE.test(i.address)) found.push({ name, address: i.address });
    }
  }
  found.sort((a, b) => Number(PREFERRED.test(b.name)) - Number(PREFERRED.test(a.name)));
  return found.map((f) => f.address);
}
