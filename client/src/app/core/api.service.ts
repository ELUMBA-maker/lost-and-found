import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface ApiItem {
  id: number;
  title: string;
  description: string;
  category: string;
  location: string;
  item_date: string;
  status: 'lost' | 'found' | 'claimed' | 'returned';
  image_data?: string;
  created_at?: string;
}

export interface CreateItemRequest {
  title: string;
  description: string;
  category: string;
  location: string;
  item_date: string;
  status: 'lost' | 'found';
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

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api';

  getItems(filters: { search?: string; status?: string } = {}): Observable<ItemsResponse> {
    let params = new HttpParams();
    if (filters.search) params = params.set('search', filters.search);
    if (filters.status) params = params.set('status', filters.status);
    return this.http.get<ItemsResponse>(`${this.apiUrl}/items`, { params });
  }

  getMyItems(accessToken: string): Observable<ItemsResponse> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<ItemsResponse>(`${this.apiUrl}/items/my`, { headers });
  }

  createItem(item: CreateItemRequest, accessToken: string): Observable<{ item: ApiItem }> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.post<{ item: ApiItem }>(`${this.apiUrl}/items`, item, { headers });
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/auth/login`, { email, password });
  }

  register(user: RegisterRequest): Observable<{ user: AuthUser }> {
    return this.http.post<{ user: AuthUser }>(`${this.apiUrl}/auth/register`, user);
  }

  getCurrentUser(accessToken: string): Observable<AuthUser> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    return this.http.get<AuthUser>(`${this.apiUrl}/users/me`, { headers });
  }
}
