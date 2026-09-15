import { Component, computed, inject, signal } from '@angular/core';
import { ApiItem, ApiService } from './core/api.service';

@Component({
  imports: [],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly api = inject(ApiService);
  protected readonly activePage = signal<'home' | 'browse' | 'report' | 'profile'>('home');
  protected readonly activeFilter = signal('All items');
  protected readonly searchTerm = signal('');
  protected readonly reportOpen = signal(false);
  protected readonly filters = ['All items', 'Lost', 'Found', 'Recently returned'];
  protected readonly items = [
    { category: 'Lost', date: '2 hours ago', description: 'Black iPhone with a cracked screen found near Central Park.', image: 'https://images.unsplash.com/photo-1743184437508-f1b3b793922b?auto=format&fit=crop&w=900&q=80', location: 'Central Park', name: 'iPhone 14 Pro' },
    { category: 'Found', date: '5 hours ago', description: 'Contains ID and credit cards, lost near downtown.', image: 'https://images.unsplash.com/photo-1661353559006-402f30f9e2a1?auto=format&fit=crop&w=900&q=80', location: 'Downtown', name: 'Brown Leather Wallet' },
    { category: 'Found', date: '1 day ago', description: 'Nike backpack with laptop inside, found at a coffee shop.', image: 'https://images.unsplash.com/photo-1521411086197-4f459beee413?auto=format&fit=crop&w=900&q=80', location: 'University Area', name: 'Blue Backpack' },
    { category: 'Lost', date: '3 hours ago', description: 'Toyota keys with a blue keychain, lost at the mall.', image: 'https://images.unsplash.com/photo-1599660541838-2e9b7c1f27f4?auto=format&fit=crop&w=900&q=80', location: 'Shopping Mall', name: 'Car Keys' },
  ];
  protected readonly apiItems = signal<ApiItem[]>([]);
  protected readonly itemsLoading = signal(true);
  protected readonly reportError = signal('');
  protected readonly reportSubmitting = signal(false);
  protected readonly filteredItems = computed(() => {
    const filter = this.activeFilter();
    const query = this.searchTerm().trim().toLowerCase();
    const source = this.apiItems().length ? this.apiItems().map((item) => ({
      category: item.status === 'found' ? 'Found' : 'Lost',
      date: item.created_at ? new Date(item.created_at).toLocaleDateString() : item.item_date,
      description: item.description,
      image: '',
      location: item.location,
      name: item.title,
    })) : this.items;
    return source.filter((item) => {
      const matchesFilter = filter === 'All items' || item.category === filter;
      const matchesSearch = !query || `${item.name} ${item.location} ${item.description}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  });
  constructor() {
    this.api.getItems().subscribe({
      next: (response) => { this.apiItems.set(response.items); this.itemsLoading.set(false); },
      error: () => this.itemsLoading.set(false),
    });
  }
  protected setFilter(filter: string): void { this.activeFilter.set(filter); }
  protected setPage(page: 'home' | 'browse' | 'report' | 'profile'): void { this.activePage.set(page); }
  protected submitReport(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const accessToken = localStorage.getItem('accessToken');
    if (!accessToken) {
      this.reportError.set('Please sign in before publishing a report.');
      return;
    }

    this.reportSubmitting.set(true);
    this.reportError.set('');
    this.api.createItem({
      category: String(values.get('category') || 'Personal items'),
      description: String(values.get('description') || 'No additional details provided.'),
      item_date: String(values.get('item_date') || new Date().toISOString().slice(0, 10)),
      location: String(values.get('location') || ''),
      status: 'lost',
      title: String(values.get('title') || ''),
    }, accessToken).subscribe({
      next: () => {
        this.api.getItems().subscribe({ next: (response) => this.apiItems.set(response.items) });
        this.reportSubmitting.set(false);
        this.setPage('browse');
      },
      error: () => { this.reportSubmitting.set(false); this.reportError.set('The report could not be published. Please try again.'); },
    });
  }
  protected openReport(): void { this.reportOpen.set(true); }
  protected closeReport(): void { this.reportOpen.set(false); }
}
