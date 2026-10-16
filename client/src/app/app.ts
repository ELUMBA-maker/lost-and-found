import { DatePipe } from "@angular/common";
import { Component, computed, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { EMPTY, Subscription, interval, startWith, switchMap } from "rxjs";
import {
  ApiClaim,
  ApiItem,
  ApiMessage,
  ApiService,
  AuthUser,
  UpdateItemRequest,
} from "./core/api.service";
import { AuthSessionService } from "./core/auth-session.service";

@Component({
  imports: [DatePipe],
  selector: "app-root",
  styleUrl: "./app.scss",
  templateUrl: "./app.html",
})
// Main application shell that manages auth, item reports, claims, admin review, and chat.
export class App {
  private readonly api = inject(ApiService);
  private readonly authSession = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  private chatPolling: Subscription | null = null;
  private dashboardPolling: Subscription | null = null;
  // Navigation and page state for the single-page community workflow.
  protected readonly activePage = signal<
    "home" | "browse" | "report" | "claim" | "profile" | "about"
  >("home");
  protected readonly activeFilter = signal("All items");
  protected readonly searchTerm = signal("");
  protected readonly reportOpen = signal(false);
  protected readonly reportStatus = signal<"lost" | "found">("lost");
  protected readonly selectedImage = signal("");
  protected readonly imageProcessing = signal(false);
  protected readonly selectedItemId = signal<number | null>(null);
  protected readonly editingItemId = signal<number | null>(null);
  protected readonly itemActionBusyId = signal<number | null>(null);
  protected readonly itemActionError = signal<{
    itemId: number;
    message: string;
  } | null>(null);
  protected readonly claimItemId = signal<number | null>(null);
  protected readonly menuOpen = signal(false);
  protected readonly authUser = signal<AuthUser | null>(null);
  protected readonly authMode = signal<"signin" | "signup">("signin");
  protected readonly passwordVisible = signal(false);
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
  protected readonly claimProof = signal<{ data: string; name: string } | null>(
    null,
  );
  protected readonly adminClaims = signal<ApiClaim[]>([]);
  protected readonly adminError = signal("");
  protected readonly adminBusyId = signal<number | null>(null);
  protected readonly activeChatClaim = signal<ApiClaim | null>(null);
  protected readonly chatMessages = signal<ApiMessage[]>([]);
  protected readonly chatError = signal("");
  protected readonly chatLoading = signal(false);
  protected readonly conversations = computed(() => [
    ...this.myClaims()
      .filter((claim) => claim.payment_status === "paid")
      .map((claim) => ({
        claim,
        itemTitle: claim.item_title || "Found item",
        otherPerson: claim.reporter_name || "Finder",
        otherRole: "Finder",
      })),
    ...this.myItems().flatMap((item) =>
      this.claimsForItem(item.id)
        .filter((claim) => claim.payment_status === "paid")
        .map((claim) => ({
          claim,
          itemTitle: item.title,
          otherPerson: claim.claimant_name || "Claimant",
          otherRole: "Claimant",
        })),
    ),
  ]);
  protected readonly claimItem = computed(
    () =>
      this.apiItems().find((item) => item.id === this.claimItemId()) || null,
  );
  protected readonly hasFoundItems = computed(() =>
    this.myItems().some(
      (item) => item.status === "found" || item.status === "claimed",
    ),
  );
  private normalizeRole(role?: string): string {
    return (role ?? "").trim().toLowerCase();
  }
  protected readonly isAdmin = computed(
    () => this.normalizeRole(this.authUser()?.role) === "admin",
  );
  // Filtered list used by the browse and landing-page item cards.
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
      itemDate: item.item_date,
      itemCategory: item.category,
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
  private refreshDashboardData(): void {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.api.getItems().subscribe({
      next: (response) => this.apiItems.set(response.items),
    });
    this.loadMyItems(accessToken);
    this.loadMyClaims(accessToken);
    if (this.isAdmin()) this.loadAdminClaims(accessToken);
  }

  private refreshProfile(): void {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.api.getCurrentUser(accessToken).subscribe({
      next: (user) => {
        const normalizedUser = {
          ...user,
          role: this.normalizeRole(user.role),
        };
        this.authUser.set(normalizedUser);
        localStorage.setItem("authUser", JSON.stringify(normalizedUser));
        if (this.normalizeRole(user.role) === "admin") {
          this.adminError.set("");
          this.loadAdminClaims(accessToken);
        } else {
          this.adminClaims.set([]);
        }
      },
      error: (error) => {
        console.error("Could not refresh the current user profile:", error);
      },
    });
  }

  private startDashboardPolling(): void {
    this.dashboardPolling?.unsubscribe();
    if (!this.authUser()) return;
    this.dashboardPolling = interval(30000)
      .pipe(
        startWith(0),
        switchMap(() => {
          this.refreshDashboardData();
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe();
  }

  // Initialize the signed-in user from local storage and load the data that belongs to them.
  constructor() {
    this.authSession.expired$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.authUser.set(null);
        this.myItems.set([]);
        this.myClaims.set([]);
        this.itemClaims.set({});
        this.adminClaims.set([]);
        this.activeChatClaim.set(null);
        this.activePage.set("profile");
        this.loginError.set("Your session expired. Please sign in again.");
      });
    const accessToken = localStorage.getItem("accessToken");
    const storedUser = localStorage.getItem("authUser");
    if (accessToken && storedUser) {
      const parsedStoredUser = JSON.parse(storedUser);
      this.authUser.set({
        ...parsedStoredUser,
        role: this.normalizeRole(parsedStoredUser?.role),
      });
      this.api.getCurrentUser(accessToken).subscribe({
        next: (user) => {
          const normalizedUser = {
            ...user,
            role: this.normalizeRole(user.role),
          };
          this.authUser.set(normalizedUser);
          localStorage.setItem("authUser", JSON.stringify(normalizedUser));
          this.refreshDashboardData();
          this.startDashboardPolling();
        },
        error: () => {
          this.refreshDashboardData();
          this.startDashboardPolling();
        },
      });
    }
    this.api.getItems().subscribe({
      next: (response) => {
        this.apiItems.set(response.items);
        this.itemsLoading.set(false);
      },
      error: () => this.itemsLoading.set(false),
    });
  }
  // Fetches the current user's reports so they can review their own posted items.
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
  // Loads claim history for the current claimant to track verification and payment status.
  private loadMyClaims(accessToken: string): void {
    this.api.getMyClaims(accessToken).subscribe({
      next: (response) => this.myClaims.set(response.claims),
      error: () => this.myClaims.set([]),
    });
  }
  private loadAdminClaims(accessToken: string): void {
    this.api.getAdminClaims(accessToken).subscribe({
      next: (response) => this.adminClaims.set(response.claims),
      error: () =>
        this.adminError.set("Admin review queue could not be loaded."),
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
  // Report creation and image preparation for lost/found item submissions.
  protected setReportStatus(status: "lost" | "found"): void {
    this.reportStatus.set(status);
  }
  protected selectImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      this.reportError.set("Please choose an image smaller than 50 MB.");
      this.selectedImage.set("");
      input.value = "";
      return;
    }
    this.reportError.set("");
    this.selectedImage.set("");
    this.imageProcessing.set(true);
    createImageBitmap(file)
      .then((bitmap) => {
        const maxDimension = 1600;
        const scale = Math.min(
          1,
          maxDimension / Math.max(bitmap.width, bitmap.height),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        const context = canvas.getContext("2d");
        if (!context) {
          bitmap.close();
          throw new Error("Image processing is unavailable");
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              this.imageProcessing.set(false);
              this.reportError.set(
                "This photo could not be prepared. Choose another image.",
              );
              input.value = "";
              return;
            }
            const reader = new FileReader();
            reader.onload = () => {
              this.selectedImage.set(String(reader.result || ""));
              this.imageProcessing.set(false);
            };
            reader.onerror = () => {
              this.imageProcessing.set(false);
              this.reportError.set(
                "This photo could not be read. Choose another image.",
              );
            };
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.82,
        );
      })
      .catch(() => {
        this.imageProcessing.set(false);
        this.reportError.set(
          "This photo could not be prepared. Choose a JPG or PNG image.",
        );
        input.value = "";
      });
  }
  protected selectClaimProof(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
        file.type,
      ) ||
      file.size > 8 * 1024 * 1024
    ) {
      this.claimError.set("Choose a JPG, PNG, WebP, or PDF smaller than 8 MB.");
      input.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.claimProof.set({ data: String(reader.result), name: file.name });
      this.claimError.set("");
    };
    reader.readAsDataURL(file);
  }
  protected setPage(
    page: "home" | "browse" | "report" | "claim" | "profile" | "about",
  ): void {
    if (page === "report" && !this.requireAuth()) return;
    this.activePage.set(page);
    this.menuOpen.set(false);
    if (page === "profile" && this.authUser()) this.refreshProfile();
  }
  protected toggleMenu(): void {
    this.menuOpen.update((isOpen) => !isOpen);
  }
  protected setAuthMode(mode: "signin" | "signup"): void {
    this.authMode.set(mode);
    this.passwordVisible.set(false);
    this.loginError.set("");
  }
  protected togglePasswordVisibility(): void {
    this.passwordVisible.update((visible) => !visible);
  }
  // Authentication and account lifecycle.
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
          const normalizedUser = {
            ...response.user,
            role: this.normalizeRole(response.user.role),
          };
          localStorage.setItem("accessToken", response.accessToken);
          localStorage.setItem("refreshToken", response.refreshToken);
          localStorage.setItem("authUser", JSON.stringify(normalizedUser));
          this.authUser.set(normalizedUser);
          this.refreshDashboardData();
          this.startDashboardPolling();
          this.loginSubmitting.set(false);
          this.setPage("home");
        },
        error: (error) => {
          this.loginSubmitting.set(false);
          const apiMessage =
            typeof error.error?.message === "string"
              ? error.error.message
              : "";
          this.loginError.set(
            apiMessage ||
              (error.status === 0
                ? "Could not reach the server. Check your connection and try again."
                : error.status === 404
                  ? "The sign-in service is unavailable. Please try again later."
                  : error.status === 401
                    ? "Email or password is incorrect."
                    : error.status === 429
                      ? "Too many sign-in attempts. Please wait a minute and try again."
                      : error.status >= 500
                        ? "Sign-in is temporarily unavailable. Please try again shortly."
                        : "Could not sign in. Check your details and try again."),
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
              const normalizedUser = {
                ...response.user,
                role: this.normalizeRole(response.user.role),
              };
              localStorage.setItem("accessToken", response.accessToken);
              localStorage.setItem("refreshToken", response.refreshToken);
              localStorage.setItem("authUser", JSON.stringify(normalizedUser));
              this.authUser.set(normalizedUser);
              this.refreshDashboardData();
              this.startDashboardPolling();
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
          if (error.status === 409) {
            this.loginError.set(
              "An account with this email already exists. Sign in or use a different email address.",
            );
            return;
          }

          const apiMessage =
            typeof error.error?.message === "string"
              ? error.error.message
              : "";
          this.loginError.set(
            apiMessage ||
              (error.status === 0
                ? "Could not reach the server. Check your connection and try again."
              : error.status === 404
                ? "The account service is unavailable. Please try again later."
                : error.status === 429
                  ? "Too many requests. Please wait a minute and try again."
                  : error.status >= 500
                    ? "Account creation is temporarily unavailable. Please try again shortly."
                    : "Could not create your account. Check your details and try again."),
          );
        },
      });
  }
  protected signOut(): void {
    this.dashboardPolling?.unsubscribe();
    this.dashboardPolling = null;
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
  protected editItem(itemId: number): void {
    this.editingItemId.set(itemId);
    this.itemActionError.set(null);
    this.selectedItemId.set(itemId);
  }
  protected cancelItemEdit(): void {
    this.editingItemId.set(null);
    this.itemActionError.set(null);
  }
  protected saveItemEdit(event: SubmitEvent, itemId: number): void {
    event.preventDefault();
    const accessToken = localStorage.getItem("accessToken");
    const currentItem = this.apiItems().find((item) => item.id === itemId);
    if (!accessToken || !currentItem) {
      this.itemActionError.set({
        itemId,
        message: "Could not find this report. Refresh the page and try again.",
      });
      return;
    }

    const values = new FormData(event.currentTarget as HTMLFormElement);
    const status = String(values.get("status") || "");
    if (!this.isItemStatus(status)) {
      this.itemActionError.set({
        itemId,
        message: "Choose a valid report status.",
      });
      return;
    }

    const updatedItem: UpdateItemRequest = {
      title: String(values.get("title") || "").trim(),
      description: String(values.get("description") || "").trim(),
      category: String(values.get("category") || "").trim(),
      location: String(values.get("location") || "").trim(),
      item_date: String(values.get("item_date") || ""),
      status,
    };

    this.itemActionBusyId.set(itemId);
    this.itemActionError.set(null);
    this.api.updateItem(itemId, updatedItem, accessToken).subscribe({
      next: ({ item }) => {
        this.apiItems.update((items) =>
          items.map((existing) => (existing.id === itemId ? item : existing)),
        );
        this.myItems.update((items) =>
          items.map((existing) => (existing.id === itemId ? item : existing)),
        );
        this.itemActionBusyId.set(null);
        this.editingItemId.set(null);
      },
      error: (error) => {
        this.itemActionBusyId.set(null);
        this.itemActionError.set({
          itemId,
          message:
            error.error?.message ||
            "Could not update this report. Please try again.",
        });
      },
    });
  }
  protected deleteItem(itemId: number): void {
    if (!window.confirm("Delete this report? This cannot be undone.")) return;
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) {
      this.itemActionError.set({
        itemId,
        message: "Please sign in again to delete this report.",
      });
      return;
    }

    this.itemActionBusyId.set(itemId);
    this.itemActionError.set(null);
    this.api.deleteItem(itemId, accessToken).subscribe({
      next: () => {
        this.apiItems.update((items) =>
          items.filter((item) => item.id !== itemId),
        );
        this.myItems.update((items) =>
          items.filter((item) => item.id !== itemId),
        );
        this.itemActionBusyId.set(null);
        this.editingItemId.set(null);
        if (this.selectedItemId() === itemId) this.selectedItemId.set(null);
      },
      error: (error) => {
        this.itemActionBusyId.set(null);
        this.itemActionError.set({
          itemId,
          message:
            error.error?.message ||
            "Could not delete this report. Please try again.",
        });
      },
    });
  }
  private isItemStatus(value: string): value is ApiItem["status"] {
    return ["lost", "found", "claimed", "returned"].includes(value);
  }
  // Publishes a new lost or found item to the community board.
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
        error: (error) => {
          this.reportSubmitting.set(false);
          this.reportError.set(
            error.error?.message ||
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
  // Sends a claim for review after the claimant identifies the item and uploads proof.
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
    this.api
      .createClaim(itemId, message, accessToken, this.claimProof() || undefined)
      .subscribe({
        next: () => {
          this.claimSubmitting.set(false);
          this.claimProof.set(null);
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
  protected reviewAdminClaim(
    claim: ApiClaim,
    status: "approved" | "rejected",
  ): void {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.adminBusyId.set(claim.id);
    this.adminError.set("");
    this.api.reviewAdminClaim(claim.id, status, accessToken).subscribe({
      next: () => {
        this.adminBusyId.set(null);
        this.loadAdminClaims(accessToken);
        this.loadMyClaims(accessToken);
        this.loadItemClaims(claim.item_id, accessToken);
      },
      error: (error) => {
        this.adminBusyId.set(null);
        this.adminError.set(
          error.error?.message ||
            "The verification decision could not be saved.",
        );
      },
    });
  }
  protected openClaimEvidence(claimId: number): void {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.api.getClaimEvidence(claimId, accessToken).subscribe({
      next: (result) =>
        window.open(result.evidence_data, "_blank", "noopener,noreferrer"),
      error: (error) =>
        this.adminError.set(
          error.error?.message || "Proof could not be opened.",
        ),
    });
  }
  protected requestPayment(event: SubmitEvent, claimId: number): void {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const values = new FormData(form);
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.adminBusyId.set(claimId);
    this.api
      .requestClaimPayment(
        claimId,
        Number(values.get("amount")),
        String(values.get("instructions") || ""),
        accessToken,
      )
      .subscribe({
        next: () => {
          this.adminBusyId.set(null);
          form.reset();
          this.loadAdminClaims(accessToken);
          this.loadMyClaims(accessToken);
        },
        error: (error) => {
          this.adminBusyId.set(null);
          this.adminError.set(
            error.error?.message || "Payment request could not be sent.",
          );
        },
      });
  }
  protected confirmPayment(claimId: number): void {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.adminBusyId.set(claimId);
    this.api.confirmClaimPayment(claimId, accessToken).subscribe({
      next: () => {
        this.adminBusyId.set(null);
        this.loadAdminClaims(accessToken);
        this.loadMyClaims(accessToken);
        this.loadMyItems(accessToken);
        const claim = this.adminClaims().find((item) => item.id === claimId);
        if (claim) this.loadItemClaims(claim.item_id, accessToken);
      },
      error: (error) => {
        this.adminBusyId.set(null);
        this.adminError.set(
          error.error?.message || "Payment confirmation could not be saved.",
        );
      },
    });
  }
  // Conversation panel used only by the claimant and finder after the payment is confirmed.
  protected openConversation(claim: ApiClaim): void {
    const accessToken = localStorage.getItem("accessToken");
    if (!accessToken) return;
    this.activeChatClaim.set(claim);
    this.chatMessages.set([]);
    this.chatError.set("");
    this.chatLoading.set(true);
    this.chatPolling?.unsubscribe();
    this.chatPolling = interval(10000)
      .pipe(
        startWith(0),
        switchMap(() => this.api.getClaimMessages(claim.id, accessToken)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (response) => {
          this.chatMessages.set(response.messages);
          this.chatLoading.set(false);
        },
        error: (error) => {
          this.chatError.set(
            error.error?.message || "Conversation could not be loaded.",
          );
          this.chatLoading.set(false);
        },
      });
  }
  protected sendConversationMessage(event: SubmitEvent): void {
    event.preventDefault();
    const claim = this.activeChatClaim();
    const accessToken = localStorage.getItem("accessToken");
    const form = event.currentTarget as HTMLFormElement;
    const message = new FormData(form).get("chat_message");
    if (
      !claim ||
      !accessToken ||
      typeof message !== "string" ||
      !message.trim()
    )
      return;
    this.api.sendClaimMessage(claim.id, message, accessToken).subscribe({
      next: (response) => {
        this.chatMessages.update((messages) => [...messages, response.message]);
        form.reset();
      },
      error: (error) =>
        this.chatError.set(
          error.error?.message || "Message could not be sent.",
        ),
    });
  }
  protected closeConversation(): void {
    this.chatPolling?.unsubscribe();
    this.chatPolling = null;
    this.activeChatClaim.set(null);
    this.chatMessages.set([]);
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
