/**
 * The account API's shapes. A copy of the contract until `packages/shared/src/api.ts` lands
 * from the server branch; then this file becomes `export type * from "@guago/shared"` style
 * re-exports and nothing else in the client changes.
 */

export type Major = "math" | "physics" | "chemistry" | "biology" | "earth";

export const MAJORS: readonly Major[] = ["math", "physics", "chemistry", "biology", "earth"];

export interface Look {
  readonly body: string;
  readonly hair: string;
  readonly hairColor: string;
  readonly face: string;
  readonly uniform: string;
  readonly accessories: readonly string[];
}

export interface Character {
  readonly id: string;
  readonly name: string;
  readonly major: Major;
  readonly look: Look;
  readonly level: number;
  readonly mapId: string;
  readonly x: number;
  readonly y: number;
  readonly cohort: number;
}

export interface Account {
  readonly id: string;
  readonly loginId: string;
}

export interface Session {
  readonly account: Account;
  readonly character: Character | null;
}

export type ApiErrorCode =
  | "login_taken"
  | "bad_credentials"
  | "rate_limited"
  | "name_taken"
  | "name_invalid"
  | "signup_limit"
  | "age_required"
  | "weak_password";

/** API codes plus what the client itself can run into. */
export type ErrorCode = ApiErrorCode | "offline" | "unknown";

export interface NameCheck {
  readonly available: boolean;
  readonly reason?: ApiErrorCode;
}

export interface Backend {
  signup(
    loginId: string,
    password: string,
    ageConfirmed: boolean,
  ): Promise<{ recoveryCode: string }>;
  login(loginId: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  /** The signed-in session, or null when there is none. */
  me(): Promise<Session | null>;
  nameAvailable(name: string): Promise<NameCheck>;
  createCharacter(name: string, major: Major, look: Look): Promise<Character>;
  recover(loginId: string, recoveryCode: string, newPassword: string): Promise<void>;
}

/** A refusal from the API, or a failure on the way to it. */
export class BackendError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}
