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
    { category: 'Found', color: 'coral', date: 'Today, 9:14 AM', description: 'Found near the north entrance of the library.', icon: '🎧', location: 'North Library', name: 'Wireless headphones' },
    { category: 'Lost', color: 'mint', date: 'Yesterday, 4:36 PM', description: 'Small silver ring with a green stone.', icon: '💍', location: 'Student Centre', name: 'Silver ring' },
    { category: 'Found', color: 'yellow', date: 'Yesterday, 11:02 AM', description: 'Blue canvas tote left on a bench by the quad.', icon: '👜', location: 'Central Quad', name: 'Canvas tote bag' },
    { category: 'Recently returned', color: 'lilac', date: '2 days ago', description: 'Returned to its owner after a community match.', icon: '🔑', location: 'East Parking Lot', name: 'Set of keys' },
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
