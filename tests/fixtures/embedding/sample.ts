import { EventEmitter } from 'events';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export interface AuthResult {
  success: boolean;
  token?: string;
  error?: string;
}

export class AuthService extends EventEmitter {
  private tokenStore: Map<string, string> = new Map();

  async authenticate(email: string, password: string): Promise<AuthResult> {
    if (!email || !password) {
      return { success: false, error: 'Email and password required' };
    }

    const token = this.generateToken(email);
    this.tokenStore.set(email, token);
    this.emit('auth', { email, success: true });

    return { success: true, token };
  }

  async validateToken(token: string): Promise<boolean> {
    for (const [, stored] of this.tokenStore) {
      if (stored === token) return true;
    }
    return false;
  }

  logout(email: string): void {
    this.tokenStore.delete(email);
    this.emit('logout', { email });
  }

  private generateToken(email: string): string {
    return Buffer.from(`${email}:${Date.now()}`).toString('base64');
  }
}

export const createAuthService = (): AuthService => new AuthService();

export const hashPassword = (password: string): string => {
  return Buffer.from(password).toString('base64');
};
