import { Component, computed, signal } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
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
  protected readonly filteredItems = computed(() => {
    const filter = this.activeFilter();
    const query = this.searchTerm().trim().toLowerCase();
    return this.items.filter((item) => {
      const matchesFilter = filter === 'All items' || item.category === filter;
      const matchesSearch = !query || `${item.name} ${item.location} ${item.description}`.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });
  });
  protected setFilter(filter: string): void { this.activeFilter.set(filter); }
  protected openReport(): void { this.reportOpen.set(true); }
  protected closeReport(): void { this.reportOpen.set(false); }
}
