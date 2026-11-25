import { describe, expect, it } from "vitest";
import { assertServable, isAdminBindable, readConfig } from "./config.ts";

describe("server config", () => {
  it("refuses the public fallback secret unless development serves localhost", () => {
    expect(() => assertServable(readConfig({ NODE_ENV: "development" }))).not.toThrow();
    expect(() => assertServable(readConfig({}))).toThrow(/SERVER_SECRET/);
    const deployed = { NODE_ENV: "development", CLIENT_ORIGIN: "https://game.example" };
    expect(() => assertServable(readConfig(deployed))).toThrow(/SERVER_SECRET/);
    expect(() => assertServable(readConfig({ ...deployed, SERVER_SECRET: "k" }))).not.toThrow();
  });

  it("keeps cookies Secure for any https origin", () => {
    expect(readConfig({ NODE_ENV: "development" }).secureCookies).toBe(false);
    expect(readConfig({}).secureCookies).toBe(true);
    const https = { NODE_ENV: "development", CLIENT_ORIGIN: "https://game.example" };
    expect(readConfig(https).secureCookies).toBe(true);
  });

  it("takes the signup limit from the environment with the PLAN default of 3", () => {
    expect(readConfig({}).signupsPerIpPerDay).toBe(3);
    expect(readConfig({ SIGNUPS_PER_IP_PER_DAY: "40" }).signupsPerIpPerDay).toBe(40);
    expect(() => readConfig({ SIGNUPS_PER_IP_PER_DAY: "0" })).toThrow();
  });

  it("binds the admin listener only to loopback or this machine's Tailscale address", () => {
    const nic = (address: string) => ({
      address,
      netmask: "",
      family: "IPv4" as const,
      mac: "",
      internal: false,
      cidr: null,
    });
    const interfaces = { tailscale0: [nic("100.101.102.103")], eth0: [nic("100.70.0.5")] };
    expect(isAdminBindable("127.0.0.1", {})).toBe(true);
    expect(isAdminBindable("100.101.102.103", interfaces)).toBe(true);
    // In Tailscale's range, but a provider's private network on another interface.
    expect(isAdminBindable("100.70.0.5", interfaces)).toBe(false);
    expect(isAdminBindable("0.0.0.0", interfaces)).toBe(false);
    expect(isAdminBindable("203.0.113.7", interfaces)).toBe(false);
  });
});
