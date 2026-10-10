import { Injectable, inject } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";
import { Observable } from "rxjs";

// Shared model for community reports and item listings.
export interface ApiItem {
  id: number;
  user_id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  item_date: string;
  status: "lost" | "found" | "claimed" | "returned";
  image_data?: string;
  created_at?: string;
}

// Claim workflow states: pending review, approved by admin, or rejected.
export interface ApiClaim {
  id: number;
  created_at?: string;
  item_id: number;
  claimant_id: number;
  message: string;
  status: "pending" | "approved" | "rejected";
  item_title?: string;
  item_description?: string;
  item_location?: string;
  reporter_name?: string;
  reporter_email?: string;
  reporter_phone?: string;
  claimant_name?: string;
  claimant_email?: string;
  claimant_phone?: string;
  evidence_name?: string;
  evidence_data?: string;
  verification_status?: "pending" | "verified" | "rejected";
  payment_status?: "not_requested" | "requested" | "paid";
  payment_amount?: number;
  payment_instructions?: string;
  verified_at?: string;
  paid_at?: string;
}

export interface ApiMessage {
  id: number;
  claim_id: number;
  sender_id: number;
  sender_name: string;
  sender_role: string;
  message: string;
  created_at: string;
}

export interface CreateItemRequest {
  title: string;
  description: string;
  category: string;
  location: string;
  item_date: string;
  status: "lost" | "found";
  image_data?: string;
  contact_phone?: string;
}

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  role?: string;
}

interface ItemsResponse {
  count: number;
  items: ApiItem[];
}

interface LoginResponse {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phone: string;
}

// Central HTTP contract used by the Angular client for items, auth, claims, admin review, and chat.
@Injectable({ providedIn: "root" })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = "/api";

  // Public item listings and filtered discovery endpoints.
  getItems(
    filters: { search?: string; status?: string } = {},
  ): Observable<ItemsResponse> {
    let params = new HttpParams();
    if (filters.search) params = params.set("search", filters.search);
    if (filters.status) params = params.set("status", filters.status);
    return this.http.get<ItemsResponse>(`${this.apiUrl}/items`, { params });
  }

  getMyItems(accessToken: string): Observable<ItemsResponse> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<ItemsResponse>(`${this.apiUrl}/items/my`, { headers });
  }

  // Creates a new lost/found report tied to the signed-in user.
  createItem(
    item: CreateItemRequest,
    accessToken: string,
  ): Observable<{ item: ApiItem }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.post<{ item: ApiItem }>(`${this.apiUrl}/items`, item, {
      headers,
    });
  }

  // Submission of a claim with optional evidence and identity proof.
  createClaim(
    itemId: number,
    message: string,
    accessToken: string,
    evidence?: { data: string; name: string },
  ): Observable<{ claim: ApiClaim }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.post<{ claim: ApiClaim }>(
      `${this.apiUrl}/claims`,
      {
        item_id: itemId,
        message,
        evidence_data: evidence?.data,
        evidence_name: evidence?.name,
      },
      { headers },
    );
  }

  // Claim history endpoints for the claimant and the reporter of the found item.
  getMyClaims(
    accessToken: string,
  ): Observable<{ count: number; claims: ApiClaim[] }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<{ count: number; claims: ApiClaim[] }>(
      `${this.apiUrl}/claims/my`,
      { headers },
    );
  }

  getItemClaims(
    itemId: number,
    accessToken: string,
  ): Observable<{ count: number; claims: ApiClaim[] }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<{ count: number; claims: ApiClaim[] }>(
      `${this.apiUrl}/claims/item/${itemId}`,
      { headers },
    );
  }

  updateClaimStatus(
    claimId: number,
    status: "approved" | "rejected",
    accessToken: string,
  ): Observable<{ claim: ApiClaim }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.patch<{ claim: ApiClaim }>(
      `${this.apiUrl}/claims/${claimId}`,
      { status },
      { headers },
    );
  }

  getAdminClaims(accessToken: string): Observable<{ claims: ApiClaim[] }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<{ claims: ApiClaim[] }>(
      `${this.apiUrl}/admin/claims`,
      { headers },
    );
  }

  getClaimEvidence(
    claimId: number,
    accessToken: string,
  ): Observable<{ evidence_data: string; evidence_name: string }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<{ evidence_data: string; evidence_name: string }>(
      `${this.apiUrl}/admin/claims/${claimId}/evidence`,
      { headers },
    );
  }

  reviewAdminClaim(
    claimId: number,
    status: "approved" | "rejected",
    accessToken: string,
  ): Observable<{ claim: ApiClaim }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.patch<{ claim: ApiClaim }>(
      `${this.apiUrl}/admin/claims/${claimId}`,
      { status },
      { headers },
    );
  }

  requestClaimPayment(
    claimId: number,
    amount: number,
    instructions: string,
    accessToken: string,
  ): Observable<unknown> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.patch(
      `${this.apiUrl}/admin/claims/${claimId}/payment`,
      { amount, instructions },
      { headers },
    );
  }

  confirmClaimPayment(
    claimId: number,
    accessToken: string,
  ): Observable<unknown> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.patch(
      `${this.apiUrl}/admin/claims/${claimId}/payment-confirmation`,
      {},
      { headers },
    );
  }

  getClaimMessages(
    claimId: number,
    accessToken: string,
  ): Observable<{ messages: ApiMessage[] }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<{ messages: ApiMessage[] }>(
      `${this.apiUrl}/claims/${claimId}/messages`,
      { headers },
    );
  }

  sendClaimMessage(
    claimId: number,
    message: string,
    accessToken: string,
  ): Observable<{ message: ApiMessage }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.post<{ message: ApiMessage }>(
      `${this.apiUrl}/claims/${claimId}/messages`,
      { message },
      { headers },
    );
  }

  getCurrentUser(accessToken: string): Observable<AuthUser> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<AuthUser>(`${this.apiUrl}/users/me`, { headers });
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, {
      email,
      password,
    });
  }

  register(user: RegisterRequest): Observable<{ user: AuthUser }> {
    return this.http.post<{ user: AuthUser }>(
      `${this.apiUrl}/auth/register`,
      user,
    );
  }
}
