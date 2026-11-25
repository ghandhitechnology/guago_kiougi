import type {
  Account,
  ApiErrorCode,
  Character,
  LoginResponse,
  Look,
  Major,
  NameAvailableResponse,
} from "@guago/shared";

export { MAJORS } from "@guago/shared";
/** The account API's shapes come from `packages/shared/src/api.ts`, shared with the server. */
export type { Account, ApiErrorCode, Character, Look, Major };

export type Session = LoginResponse;
export type NameCheck = NameAvailableResponse;

/** API codes plus what the client itself can run into. */
export type ErrorCode = ApiErrorCode | "offline" | "unknown";

export interface Backend {
  /** Creates the account and signs it in. */
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
  /** Sets a new password; the old code is spent and a new one comes back to be saved. */
  recover(
    loginId: string,
    recoveryCode: string,
    newPassword: string,
  ): Promise<{ recoveryCode: string }>;
}

/** A refusal from the API, or a failure on the way to it. */
export class BackendError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
  }
}
