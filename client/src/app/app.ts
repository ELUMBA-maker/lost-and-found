import { Component, computed, inject, signal } from "@angular/core";
import { ApiClaim, ApiItem, ApiService, AuthUser } from "./core/api.service";

@Component({
  imports: [],
  selector: "app-root",
  styleUrl: "./app.scss",
  templateUrl: "./app.html",
})
export class App {
  private readonly api = inject(ApiService);
  protected readonly activePage = signal<
    "home" | "browse" | "report" | "claim" | "profile" | "about"
  >("home");
  protected readonly activeFilter = signal("All items");
  protected readonly searchTerm = signal("");
  protected readonly reportOpen = signal(false);
  protected readonly reportStatus = signal<"lost" | "found">("lost");
  protected readonly selectedImage = signal("");
  protected readonly selectedItemId = signal<number | null>(null);
  protected readonly claimItemId = signal<number | null>(null);
  protected readonly menuOpen = signal(false);
  protected readonly authUser = signal<AuthUser | null>(null);
  protected readonly authMode = signal<"signin" | "signup">("signin");
  protected readonly loginError = signal("");
  protected readonly loginSubmitting = signal(false);
  protected readonly filters = [
    "All items",
    "Lost",
    "Found",
    "Recently returned",
  ];
  protected readonly apiItems = signal<ApiItem[]>([]);
  protected readonly myItems = signal<ApiItem[]>([]);
  protected readonly myClaims = signal<ApiClaim[]>([]);
  protected readonly itemClaims = signal<Record<number, ApiClaim[]>>({});
  protected readonly itemsLoading = signal(true);
  protected readonly reportError = signal("");
  protected readonly reportSubmitting = signal(false);
  protected readonly claimError = signal("");
  protected readonly claimSubmitting = signal(false);
  protected readonly claimReviewingId = signal<number | null>(null);
  protected readonly claimReviewError = signal("");
  protected readonly claimItem = computed(
    () =>
      this.apiItems().find((item) => item.id === this.claimItemId()) || null,
  );
  protected readonly hasFoundItems = computed(() =>
    this.myItems().some(
      (item) => item.status === "found" || item.status === "claimed",
    ),
  );
  protected readonly filteredItems = computed(() => {
    const filter = this.activeFilter();
    const query = this.searchTerm().trim().toLowerCase();
    const source = this.apiItems().map((item) => ({
      id: item.id,
      ownerId: item.user_id,
      status: item.status,
      category: item.status === "found" ? "Found" : "Lost",
      date: item.created_at
        ? new Date(item.created_at).toLocaleDateString()
        : item.item_date,
      description: item.description,
      location: item.location,
      name: item.title,
      image: item.image_data || "",
    }));
    return source.filter((item) => {
      const matchesFilter = filter === "All items" || item.category === filter;
      const matchesSearch =
        !query ||
        `${item.name} ${item.location} ${item.description}`
          .toLowerCase()
          .includes(query);
      return matchesFilter && matchesSearch;
    });
  });
  constructor() {
    const accessToken = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("authUser");
    if (accessToken && storedUser) {
      this.authUser.set(JSON.parse(storedUser));
      this.loadMyItems(accessToken);
      this.loadMyClaims(accessToken);
    }
    this.api.getItems().subscribe({
      next: (response) => {
        this.apiItems.set(response.items);
        this.itemsLoading.set(false);
      },
      error: () => this.itemsLoading.set(false),
    });
  }
  private loadMyItems(accessToken: string): void {
    this.api.getMyItems(accessToken).subscribe({
      next: (response) => {
        this.myItems.set(response.items);
        response.items
          .filter(
            (item) => item.status === "found" || item.status === "claimed",
          )
          .forEach((item) => this.loadItemClaims(item.id, accessToken));
      },
      error: () => this.myItems.set([]),
    });
  }
  private loadMyClaims(accessToken: string): void {
    this.api.getMyClaims(accessToken).subscribe({
      next: (response) => this.myClaims.set(response.claims),
      error: () => this.myClaims.set([]),
    });
  }
  private loadItemClaims(itemId: number, accessToken: string): void {
    this.api.getItemClaims(itemId, accessToken).subscribe({
      next: (response) =>
        this.itemClaims.update((claims) => ({
          ...claims,
          [itemId]: response.claims,
        })),
    });
  }
  protected claimsForItem(itemId: number): ApiClaim[] {
    return this.itemClaims()[itemId] || [];
  }
  protected setFilter(filter: string): void {
    if (!this.requireAuth()) return;
    this.activeFilter.set(filter);
  }
  protected toggleItemDetails(itemId: number): void {
    this.selectedItemId.update((selectedId) =>
      selectedId === itemId ? null : itemId,
    );
  }
  protected setSearchTerm(value: string): void {
    if (!this.requireAuth()) return;
    this.searchTerm.set(value);
  }
  protected setReportStatus(status: "lost" | "found"): void {
    this.reportStatus.set(status);
  }
  protected selectImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      this.reportError.set("Please choose an image smaller than 50 MB.");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.selectedImage.set(String(reader.result || ""));
    reader.readAsDataURL(file);
  }
  protected setPage(
    page: "home" | "browse" | "report" | "claim" | "profile" | "about",
  ): void {
    if (page === "report" && !this.requireAuth()) return;
    this.activePage.set(page);
    this.menuOpen.set(false);
  }
  protected toggleMenu(): void {
    this.menuOpen.update((isOpen) => !isOpen);
  }
  protected setAuthMode(mode: "signin" | "signup"): void {
    this.authMode.set(mode);
    this.loginError.set("");
  }
  protected login(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    this.loginSubmitting.set(true);
    this.loginError.set("");
    this.api
      .login(
        String(values.get("email") || ""),
        String(values.get("password") || ""),
      )
      .subscribe({
        next: (response) => {
          localStorage.setItem("accessToken", response.accessToken);
          localStorage.setItem("refreshToken", response.refreshToken);
          localStorage.setItem("authUser", JSON.stringify(response.user));
          this.authUser.set(response.user);
          this.loadMyItems(response.accessToken);
          this.loadMyClaims(response.accessToken);
          this.loginSubmitting.set(false);
          this.setPage("home");
        },
        error: (error) => {
          this.loginSubmitting.set(false);
          this.loginError.set(
            error.error?.message ||
              "Sign in failed. Check your email and password.",
          );
        },
      });
  }
  protected register(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const email = String(values.get("email") || "");
    const password = String(values.get("password") || "");
    this.loginSubmitting.set(true);
    this.loginError.set("");
    this.api
      .register({
        email,
        name: String(values.get("name") || ""),
        password,
        phone: String(values.get("phone") || ""),
      })
      .subscribe({
        next: () => {
          this.api.login(email, password).subscribe({
            next: (response) => {
              localStorage.setItem("accessToken", response.accessToken);
              localStorage.setItem("refreshToken", response.refreshToken);
              localStorage.setItem("authUser", JSON.stringify(response.user));
              this.authUser.set(response.user);
              this.loadMyItems(response.accessToken);
              this.loadMyClaims(response.accessToken);
              this.loginSubmitting.set(false);
              this.setPage("home");
            },
            error: () => {
              this.loginSubmitting.set(false);
              this.loginError.set(
                "Account created. Please sign in to continue.",
              );
              this.authMode.set("signin");
            },
          });
        },
        error: (error) => {
          this.loginSubmitting.set(false);
          this.loginError.set(
            error.error?.message || "Could not create your account.",
          );
        },
      });
  }
  protected signOut(): void {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("authUser");
    this.authUser.set(null);
    this.myItems.set([]);
    this.setPage("home");
  }
  protected requireAuth(): boolean {
    if (this.authUser() && localStorage.getItem("accessToken")) return true;
    this.loginError.set("Please sign in to use this feature.");
    this.activePage.set("profile");
    this.menuOpen.set(false);
    return false;
  }
  protected submitReport(event: SubmitEvent): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
      this.reportError.set("Please sign in before publishing a report.");
      return;
    }

    this.reportSubmitting.set(true);
    this.reportError.set("");
    this.api
      .createItem(
        {
          category: String(values.get("category") || "Personal items"),
          description: String(
            values.get("description") || "No additional details provided.",
          ),
          item_date: String(
            values.get("item_date") || new Date().toISOString().slice(0, 10),
          ),
          location: String(values.get("location") || ""),
          status: this.reportStatus(),
          title: String(values.get("title") || ""),
          image_data: this.selectedImage(),
        },
        accessToken,
      )
      .subscribe({
        next: () => {
          this.selectedImage.set("");
          form.reset();
          const fileInput = form.querySelector<HTMLInputElement>(
            'input[type="file"][name="image"]',
          );
          if (fileInput) fileInput.value = "";
          this.api.getItems().subscribe({
            next: (response) => this.apiItems.set(response.items),
          });
          if (accessToken) this.loadMyItems(accessToken);
          this.reportSubmitting.set(false);
          this.setPage("browse");
        },
        error: () => {
          this.reportSubmitting.set(false);
          this.reportError.set(
            "The report could not be published. Please try again.",
          );
        },
      });
  }
  protected startClaim(itemId: number): void {
    if (!this.requireAuth()) return;
    this.claimItemId.set(itemId);
    this.claimError.set("");
    this.activePage.set("claim");
  }
  protected submitClaim(event: SubmitEvent): void {
    event.preventDefault();
    const itemId = this.claimItemId();
    const accessToken = localStorage.getItem("accessToken");
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    if (!itemId || !accessToken) {
      this.claimError.set("Please sign in before submitting a claim.");
      return;
    }

    this.claimSubmitting.set(true);
    this.claimError.set("");
    const message = [
      `Item: ${String(values.get("claim_title") || "")}`,
      `Category: ${String(values.get("claim_category") || "")}`,
      `Last seen: ${String(values.get("claim_location") || "")}`,
      `Lost on: ${String(values.get("claim_date") || "")}`,
      `Identifying details: ${String(values.get("description") || "")}`,
    ].join("\n");
    this.api.createClaim(itemId, message, accessToken).subscribe({
      next: () => {
        this.claimSubmitting.set(false);
        this.loadMyClaims(accessToken);
        this.loadMyItems(accessToken);
        this.setPage("profile");
      },
      error: (error) => {
        this.claimSubmitting.set(false);
        this.claimError.set(
          error.error?.message ||
            "Your claim could not be submitted. Please try again.",
        );
      },
    });
  }
  protected reviewClaim(
    claimId: number,
    itemId: number,
    status: "approved" | "rejected",
  ): void {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.claimReviewingId.set(claimId);
    this.claimReviewError.set("");
    this.api.updateClaimStatus(claimId, status, accessToken).subscribe({
      next: () => {
        this.claimReviewingId.set(null);
        this.loadItemClaims(itemId, accessToken);
        this.loadMyClaims(accessToken);
        this.loadMyItems(accessToken);
        this.api
          .getItems()
          .subscribe({ next: (response) => this.apiItems.set(response.items) });
      },
      error: () => {
        this.claimReviewingId.set(null);
        this.claimReviewError.set(
          "The claim decision could not be saved. Please try again.",
        );
      },
    });
  }
  protected chatLink(phone?: string): string {
    const digits = phone?.replace(/\D/g, "") || "";
    return digits ? `https://wa.me/${digits}` : "";
  }
  protected openReport(): void {
    this.reportOpen.set(true);
  }
  protected closeReport(): void {
    this.reportOpen.set(false);
  }
}
