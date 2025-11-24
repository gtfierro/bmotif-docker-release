import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { LibraryService, Library, Template, BrickClass } from '../library/library.service';
import { TemplateDetailService } from '../template-detail/template-detail.service';
import { API_URL } from '../env';
import { forkJoin } from 'rxjs';

type ShapeItem = {
  shape_uri: string;
  label: string | null;
  library_name: string;
  shape_collection_id: number;
};

@Component({
  selector: 'app-library-detail',
  templateUrl: './library-detail.component.html',
  styleUrls: ['./library-detail.component.css']
})
export class LibraryDetailComponent implements OnInit {
  libraryId!: number;
  library: Library | null = null;

  // Classes
  classFilter = '';
  classes: BrickClass[] = [];
  filteredClasses: BrickClass[] = [];

  // Shapes
  shapeCollectionId: number | null = null;
  shapesByDefType: Record<string, ShapeItem[]> = {};
  defTypes: string[] = [];
  selectedDefType: string | null = null;
  shapesLoading = false;
  private shapesLoaded = false;

  // TTL viewers
  codeMirrorOptions: any = {
    theme: 'material',
    mode: 'text/turtle',
    lineNumbers: true,
    lineWrapping: true,
    readOnly: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
    autoCloseBrackets: true,
    matchBrackets: true,
    lint: true
  };

  // Shape collection TTL (best-effort)
  ontologyName: string | null = null;
  shapeCollectionTTL: string = '';
  shapeTTLLoading = false;
  shapeTTLError: string | null = null;

  // Templates list (accordion)
  public templates: Template[] = [];
  public templateFilter: string = '';
  public filteredTemplates: Template[] = [];
  private templatesLoaded: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private libraryService: LibraryService,
    private templateDetailService: TemplateDetailService
  ) {}

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const parsed = idParam ? parseInt(idParam, 10) : NaN;
    if (!idParam || isNaN(parsed)) {
      // No ID provided: redirect to first library if available
      this.libraryService.getAllLibraries().subscribe({
        next: (libs) => {
          const first = (libs || [])[0];
          if (first && typeof first.id === 'number') {
            this.router.navigate(['/libraries', first.id]);
          } else {
            // keep view in loading/empty state
            this.library = null;
          }
        },
        error: (_err) => {
          this.library = null;
        }
      });
      return;
    }

    this.libraryId = parsed;
    this.loadLibrary();
    this.loadClasses();
    this.loadOntologyName();
  }

  private loadLibrary(): void {
    // Fetch minimal library details without expanding templates to avoid heavy payloads on initial load
    this.http.get<Library>(API_URL + `/libraries/${this.libraryId}`).subscribe({
      next: (lib) => {
        this.library = lib as any;
        this.shapeCollectionId = (lib as any)?.shape_collection_id ?? null;

        // Defer template loading until Templates tab is opened
        this.templates = [];
        this.applyTemplateFilter();
      },
      error: (err) => {
        console.error('Failed to load library', err);
      }
    });
  }

  private loadTemplatesByIds(ids: number[]): void {
    if (!Array.isArray(ids) || !ids.length) {
      this.templates = [];
      this.applyTemplateFilter();
      this.templatesLoaded = true;
      return;
    }
    forkJoin(ids.map((id) => this.templateDetailService.getTemplate(id, false))).subscribe({
      next: (tmpls) => {
        this.templates = (tmpls || []).sort((a, b) => a.name.localeCompare(b.name));
        this.applyTemplateFilter();
        this.templatesLoaded = true;
      },
      error: (err) => {
        console.error('Failed to load templates by IDs', err);
        this.templates = [];
        this.applyTemplateFilter();
        this.templatesLoaded = true;
      }
    });
  }

  private loadClasses(): void {
    this.libraryService.getLibraryClasses(this.libraryId).subscribe({
      next: (classes) => {
        this.classes = classes || [];
        this.applyClassFilter();
      },
      error: (err) => {
        console.error('Failed to load library classes', err);
      }
    });
  }

  applyClassFilter(): void {
    const q = (this.classFilter || '').toLowerCase().trim();
    if (!q) {
      this.filteredClasses = this.classes.slice();
      return;
    }
    this.filteredClasses = this.classes.filter(c =>
      (c.label || '').toLowerCase().includes(q) ||
      (c.uri || '').toLowerCase().includes(q) ||
      (c.definition || '').toLowerCase().includes(q)
    );
  }

  private loadShapes(): void {
    if (this.shapesLoaded || this.shapesLoading) {
      return;
    }
    if (!this.shapeCollectionId) {
      this.shapesByDefType = {};
      this.defTypes = [];
      this.selectedDefType = null;
      return;
    }
    this.shapesLoading = true;
    this.http.get<{ shape_uri: string; label: string | null }[]>(
      API_URL + `/libraries/${this.libraryId}/shape_collection/shapes`
    ).subscribe({
      next: (shapes) => {
        const items: ShapeItem[] = (shapes || [])
          .map(s => ({
            shape_uri: s.shape_uri,
            label: s.label ?? null,
            library_name: this.library?.name ?? '',
            shape_collection_id: this.shapeCollectionId as number
          }))
          .sort((a, b) => {
            const an = (a.label || a.shape_uri).toLowerCase();
            const bn = (b.label || b.shape_uri).toLowerCase();
            return an.localeCompare(bn);
          });

        this.shapesByDefType = { All: items };
        this.defTypes = ['All'];
        this.selectedDefType = 'All';
        this.shapesLoaded = true;
      },
      error: (err) => {
        console.error('Failed to load shapes', err);
      },
      complete: () => {
        this.shapesLoading = false;
      }
    });
  }

  private loadOntologyName(): void {
    this.http.get<{ ontology_name: string | null }>(API_URL + `/libraries/${this.libraryId}/shape_collection/ontology_name`)
      .subscribe({
        next: (res) => {
          this.ontologyName = res?.ontology_name ?? null;
          if (this.ontologyName) {
            this.tryFetchShapeCollectionTTL(this.ontologyName);
          }
        },
        error: (err) => {
          console.error('Failed to load ontology_name', err);
        }
      });
  }

  private tryFetchShapeCollectionTTL(ontologyName: string): void {
    this.shapeTTLLoading = true;
    this.shapeTTLError = null;
    const headers = new HttpHeaders({ 'Accept': 'text/turtle' });
    this.http.get(API_URL + `/graph/${encodeURIComponent(ontologyName)}`, { headers, responseType: 'text' })
      .subscribe({
        next: (ttl) => {
          const text = typeof ttl === 'string' ? ttl : '';
          this.shapeCollectionTTL = text;
          if (!text || !text.trim()) {
            this.shapeTTLError = 'This shape collection graph is empty or unavailable.';
          }
        },
        error: (_err) => {
          this.shapeTTLError = 'TTL not available via API for this library’s shape collection.';
        },
        complete: () => {
          this.shapeTTLLoading = false;
        }
      });
  }

  onSelectDefType(defType: string): void {
    this.selectedDefType = defType;
  }

  // Lazy-load templates when Templates tab is opened
  private ensureTemplatesLoaded(): void {
    if (this.templatesLoaded) return;
    const lib: any = this.library as any;

    const tmplList = lib?.templates as Template[] | undefined;
    const tmplIds = lib?.template_ids as number[] | undefined;

    if (Array.isArray(tmplList) && tmplList.length) {
      this.templates = tmplList.slice().sort((a, b) => a.name.localeCompare(b.name));
      this.applyTemplateFilter();
      this.templatesLoaded = true;
      return;
    }

    if (Array.isArray(tmplIds) && tmplIds.length) {
      this.loadTemplatesByIds(tmplIds);
      return;
    }

    // Fallback: fetch expanded templates only on demand
    this.libraryService.getLibrarysTemplates(this.libraryId).subscribe({
      next: (libExpanded) => {
        const list = (libExpanded as any)?.templates as Template[] | undefined;
        this.templates = Array.isArray(list) ? list.slice().sort((a, b) => a.name.localeCompare(b.name)) : [];
        this.applyTemplateFilter();
        this.templatesLoaded = true;
      },
      error: (err) => {
        console.error('Failed to load templates on demand', err);
        this.templates = [];
        this.applyTemplateFilter();
        this.templatesLoaded = true;
      }
    });
  }

  onTabsChange(event: any): void {
    const label: string = event?.tab?.textLabel || '';
    if (label === 'Templates') {
      this.ensureTemplatesLoaded();
    }
    if (label === 'Shapes') {
      this.loadShapes();
    }
  }



  public applyTemplateFilter(): void {
    const q = (this.templateFilter || '').toLowerCase().trim();
    if (!q) {
      this.filteredTemplates = this.templates.slice().sort((a, b) => a.name.localeCompare(b.name));
      return;
    }
    this.filteredTemplates = this.templates
      .filter(t => (t.name || '').toLowerCase().includes(q) || String((t as any).id).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  copy(text: string): void {
    navigator.clipboard?.writeText(text).catch(() => {});
  }

  downloadShapeTTL(): void {
    const fallbackName = this.library?.name || this.ontologyName || `library-${this.libraryId}`;
    const safeName = (fallbackName || '').toString().replace(/[^\w\-]+/g, '_') || 'library';

    const triggerDownload = (text: string) => {
      const blob = new Blob([text], { type: 'text/turtle;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}-shapes.ttl`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    };

    const existing = (this.shapeCollectionTTL || '').trim();
    if (existing) {
      triggerDownload(existing);
      return;
    }

    if (this.ontologyName) {
      this.shapeTTLLoading = true;
      const headers = new HttpHeaders({ 'Accept': 'text/turtle' });
      this.http.get(API_URL + `/graph/${encodeURIComponent(this.ontologyName)}`, { headers, responseType: 'text' })
        .subscribe({
          next: (ttl) => {
            const text = typeof ttl === 'string' ? ttl : '';
            if (text && text.trim()) {
              this.shapeCollectionTTL = text;
              triggerDownload(text);
            } else {
              console.error('Empty TTL for shape collection');
            }
          },
          error: (err) => {
            console.error('Failed to fetch TTL for download', err);
          },
          complete: () => {
            this.shapeTTLLoading = false;
          }
        });
    }
  }
}
