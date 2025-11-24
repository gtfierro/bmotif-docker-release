import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Model } from '../types'
import { ModelDetailService } from './model-detail.service'
import { ModelNetworkComponent } from '../model-network/model-network.component'
import {FormControl, FormGroup} from '@angular/forms';
import {
  MatSnackBar,
  MatSnackBarHorizontalPosition,
  MatSnackBarVerticalPosition,
} from '@angular/material/snack-bar';
import {MatDialog} from '@angular/material/dialog';
import {TemplateEvaluateComponent} from '../template-evaluate/template-evaluate.component'
import { TemplateEvaluateService } from '../template-evaluate/template-evaluate.service';
import { forkJoin, Subscription } from 'rxjs';
import { Library, Template } from '../library/library.service';
import { ModelValidateService } from '../model-validate/model-validate.service';

interface SuggestedTemplateParam {
  name: string;
  types: string[];
}

interface SuggestedTemplate {
  id?: number;
  template_id?: number;
  body: string;
  parameters: SuggestedTemplateParam[];
  focus?: string | null;
}

@Component({
  selector: 'app-model-detail',
  templateUrl: './model-detail.component.html',
  providers: [ModelDetailService],
  styleUrls: ['./model-detail.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ModelDetailComponent implements OnInit, OnDestroy{
  model: Model;
  graph: string; // graph as in DB
  manifest: string; // manifest as in DB
  hasManifest: boolean = false;
  graphFormControl: FormControl = new FormControl(''); // graph as in UI
  manifestFormControl: FormControl = new FormControl(''); // manifest as in UI
  codeMirrorOptions: any = {
    theme: 'material',
    mode: 'application/xml',
    lineNumbers: true,
    lineWrapping: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter', 'CodeMirror-lint-markers'],
    autoCloseBrackets: true,
    matchBrackets: true,
    lint: true
  };
  showFiller: boolean = true;
  sideNaveOpen: boolean = false;
  updatingGraphSpinner: boolean = false;
  hasTemplates: boolean = false;
  templates: SuggestedTemplate[] = [];
  // Precomputed parameter groupings per template index
  groupedParams: { [typeUri: string]: SuggestedTemplateParam[] }[] = [];
  forms: FormGroup[] = [];
  private subscriptions = new Subscription();

  @ViewChild('mainValidate') mainValidateComp: any;
  @ViewChild('sideValidate') sideValidateComp: any;

  // Manifest selector state
  libraries: Library[] = [];
  selectedLibraryIds: Set<number> = new Set<number>();
  templatesByLibrary: {[libraryId: number]: Template[]} = {};
  templatesList: Template[] = [];
  selectedTemplateIds: Set<number> = new Set<number>();

  constructor(
    private route: ActivatedRoute,
    private ModelDetailService: ModelDetailService,
    private _snackBar: MatSnackBar,
    public dialog: MatDialog,
    private validateService: ModelValidateService,
    private templateEval: TemplateEvaluateService,
    private cdr: ChangeDetectorRef,
  ) {
    [this.model, this.graph, this.manifest] = route.snapshot.data["ModelDetailResolver"];
    this.graphFormControl.setValue(this.graph);
    this.hasManifest = !!(this.manifest && this.manifest.trim().length > 0);
    this.manifestFormControl.setValue(this.manifest);
  }

  ngOnInit(): void {
    forkJoin({
      libs: this.ModelDetailService.getAllLibraries(),
      imports: this.ModelDetailService.getManifestLibraries(this.model.id)
    }).subscribe({
      next: ({libs, imports}) => {
        this.libraries = libs || [];
        (imports || []).forEach((id: number) => this.selectedLibraryIds.add(id));
        this.refreshTemplatesForSelectedLibraries();
      },
      error: (err) => {
        console.error('Failed to load libraries/imports', err);
      }
    });

    // Listen for validation templates for this model
    this.subscriptions.add(
      this.validateService.templates$.subscribe((payload) => {
        if (payload && payload.modelId === this.model.id) {
          this.applyTemplates(payload.templates || []);
        }
      })
    );

    // Prime from cache in case templates were already fetched earlier
    this.subscriptions.add(
      this.validateService.getValidationTemplates(this.model.id).subscribe(({ templates }) => {
        if (templates && templates.length) {
          this.applyTemplates(templates);
        }
      })
    );
  }

  onSave(): void{
    this.ModelDetailService.updateModelGraph(this.model.id, this.graphFormControl.value)
      .subscribe({
        next: (data: string) => {
          this.graph = data
          this.openSnackBar("success")
        }, // success path
        error: (error) => {
          this.openSnackBar("error")
          console.log(error)
        } // error path
      });
  }

  openSnackBar(message: string) {
    this._snackBar.open(message, "close", {});
  }

  undoChangesToGraph(): void {
    this.graphFormControl.setValue(this.graph)
  }

  downloadGraphTTL(): void {
    const ttl: string = this.graphFormControl.value ?? '';
    const baseName = (this.model?.name || `model-${this.model?.id || 'graph'}`);
    const safeName = baseName.replace(/[^\w\-]+/g, '_');
    const blob = new Blob([ttl], { type: 'text/turtle;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.ttl`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }

  openEvaulateEvent(templateId: number): void {
    this.dialog.open(
      TemplateEvaluateComponent,
      {data: {templateId, modelId: this.model.id}}
    );
  }

  // Manifest selectors helpers
  private refreshTemplatesForSelectedLibraries(): void {
    const toFetch = Array.from(this.selectedLibraryIds).filter(
      (libId) => !(libId in this.templatesByLibrary)
    );

    if (toFetch.length === 0) {
      this.computeTemplatesList();
      return;
    }

    // Fetch templates for any libraries we haven't loaded yet
    const fetches = toFetch.map((libId) =>
      this.ModelDetailService.getLibrarysTemplates(libId)
    );

    forkJoin(fetches).subscribe({
      next: (libraries) => {
        libraries.forEach((lib) => {
          if (lib && lib.id != null) {
            this.templatesByLibrary[lib.id] = lib.templates || [];
          }
        });
        this.computeTemplatesList();
      },
      error: (err) => {
        console.error('Failed fetching templates for libraries', err);
        this.computeTemplatesList();
      }
    });
  }

  private computeTemplatesList(): void {
    const list: Template[] = [];
    const seen = new Set<number>();
    Array.from(this.selectedLibraryIds).forEach((libId) => {
      const tpls = this.templatesByLibrary[libId] || [];
      tpls.forEach((t) => {
        if (!seen.has(t.id)) {
          list.push(t);
          seen.add(t.id);
        }
      });
    });
    this.templatesList = list.sort((a, b) => a.name.localeCompare(b.name));
    // Leave previously selected template IDs as-is; user controls them explicitly
  }

  private normalizeIdCollection(value: unknown): number[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is number => typeof v === 'number');
    }
    if (typeof value === 'number') {
      return [value];
    }
    if (value && typeof value === 'object') {
      const obj: any = value as any;
      if (Array.isArray(obj.library_ids)) {
        return obj.library_ids.filter((v: any): v is number => typeof v === 'number');
      }
      if (Array.isArray(obj.imports)) {
        return obj.imports.filter((v: any): v is number => typeof v === 'number');
      }
      if (typeof obj[Symbol.iterator] === 'function') {
        return Array.from(obj as Iterable<any>).filter((v: any): v is number => typeof v === 'number');
      }
    }
    return [];
  }

  onLibrarySelectionChange(lib: Library, selected: boolean): void {
    if (selected) {
      this.selectedLibraryIds.add(lib.id);
    } else {
      this.selectedLibraryIds.delete(lib.id);
      // Remove templates from deselected library from selectedTemplateIds
      const tpls = this.templatesByLibrary[lib.id] || [];
      tpls.forEach((t) => this.selectedTemplateIds.delete(t.id));
    }
    this.refreshTemplatesForSelectedLibraries();
  }

  selectAllLibraries(): void {
    (this.libraries || []).forEach((lib) => this.selectedLibraryIds.add(lib.id));
    this.refreshTemplatesForSelectedLibraries();
  }


  onTemplateSelectionChange(tmpl: Template, selected: boolean): void {
    if (selected) {
      this.selectedTemplateIds.add(tmpl.id);
    } else {
      this.selectedTemplateIds.delete(tmpl.id);
    }
  }

  saveManifest(): void {
    const library_ids = Array.from(this.selectedLibraryIds);
    this.ModelDetailService.updateManifestSelections(this.model.id, library_ids)
      .subscribe({
        next: (updatedManifest: string) => {
          this.applyManifestUpdate(updatedManifest);
          this.openSnackBar("manifest saved");
        },
        error: (err) => {
          console.error('Failed to save manifest', err);
          this.openSnackBar("error saving manifest");
        }
      });
  }

  saveManifestTTL(): void {
    const ttl = this.manifestFormControl.value ?? '';
    this.ModelDetailService.updateManifestTTL(this.model.id, ttl)
      .subscribe({
        next: (updatedManifest: string) => {
          this.applyManifestUpdate(updatedManifest);
          this.openSnackBar("manifest TTL saved");
        },
        error: (err) => {
          console.error('Failed to save manifest TTL', err);
          this.openSnackBar("error saving manifest TTL");
        }
      });
  }

  private applyManifestUpdate(updatedManifest: string): void {
    this.manifest = updatedManifest;
    this.manifestFormControl.setValue(updatedManifest);
    this.hasManifest = !!(updatedManifest && updatedManifest.trim().length > 0);
    // Manifest changed: invalidate cached validation
    this.validateService.clearValidationCache(this.model.id);
    // Clear any previously suggested templates; they are now stale
    this.templates = [];
    this.hasTemplates = false;
    // Trigger UI refresh for OnPush change detection so tab labels update immediately
    this.cdr.markForCheck();
  }

  onMainTabsChange(event: any): void {
    const label: string = event?.tab?.textLabel || '';
    if (label.startsWith('Validate')) {
      setTimeout(() => this.mainValidateComp?.validate(), 0);
    }
  }

  onSideTabsChange(event: any): void {
    const label: string = event?.tab?.textLabel || '';
    if (label.startsWith('Validate')) {
      setTimeout(() => this.sideValidateComp?.validate(), 0);
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  trackByTemplateFocus(_index: number, t: SuggestedTemplate) {
    return t.focus ?? _index;
  }

  // Simplify a URI to a human-readable label:
  // - If BRICK namespace, return "brick:Value"
  // - Else return the final segment after '#' or '/'.
  simplifyUriLabel(value?: string | null): string {
    if (!value) return '';
    try {
      let v = String(value).trim();
      // strip angle brackets if present
      if (v.startsWith('<') && v.endsWith('>')) v = v.slice(1, -1);

      const brickPrefixes = [
        'https://brickschema.org/schema/Brick#',
        'http://brickschema.org/schema/Brick#',
      ];
      for (const prefix of brickPrefixes) {
        if (v.startsWith(prefix)) {
          return `brick:${decodeURIComponent(v.slice(prefix.length))}`;
        }
      }

      const hashIdx = v.lastIndexOf('#');
      if (hashIdx >= 0 && hashIdx < v.length - 1) {
        return decodeURIComponent(v.slice(hashIdx + 1));
      }

      // trim trailing slashes and take last path segment
      v = v.replace(/\/+$/, '');
      const parts = v.split('/');
      const last = parts[parts.length - 1] || '';
      return decodeURIComponent(last);
    } catch {
      return String(value ?? '');
    }
  }

  private buildGroupedParams(templates: SuggestedTemplate[]): { [typeUri: string]: SuggestedTemplateParam[] }[] {
    return (templates || []).map(t => {
      const groups: { [typeUri: string]: SuggestedTemplateParam[] } = {};
      const params = Array.isArray(t?.parameters) ? t.parameters : [];
      for (const p of params) {
        const types = (Array.isArray(p.types) && p.types.length) ? p.types : ['(untyped)'];
        for (const typeUri of types) {
          if (!groups[typeUri]) groups[typeUri] = [];
          groups[typeUri].push(p);
        }
      }
      return groups;
    });
  }

  private applyTemplates(templates: SuggestedTemplate[]): void {
    // Enforce valid numeric IDs; drop any templates without an ID
    const withIds = (templates || []).filter((t: any) => typeof (t?.id ?? t?.template_id) === 'number');
    // Also normalize id from template_id if needed (defensive)
    this.templates = withIds.map((t: any) => {
      const raw = t.id ?? t.template_id;
      return (typeof raw === 'number') ? { ...t, id: raw } : t;
    });
    this.hasTemplates = this.templates.length > 0;
    this.groupedParams = this.buildGroupedParams(this.templates);
    // reset forms when template set changes
    this.forms = [];
    this.cdr.markForCheck();
  }

  ensureTemplateForm(index: number): void {
    if (this.forms[index]) return;
    const t = this.templates[index];
    const controls: { [k: string]: FormControl } = {};
    const params = Array.isArray(t?.parameters) ? t.parameters : [];
    for (const p of params) {
      controls[p.name] = new FormControl('');
    }
    this.forms[index] = new FormGroup(controls);
  }

  addTemplate(index: number): void {
    const t = this.templates[index];
    const form = this.forms[index];
    if (!t || !form) {
      console.error('Form not ready for this template.');
      return;
    }
    const templateId = (t as any)?.id;
    if (typeof templateId !== 'number') {
      console.error('Cannot add: suggested template missing id');
      return;
    }
    const params: { [name: string]: string } = {};
    Object.keys(form.controls).forEach(name => {
      const value = form.get(name)?.value;
      if (value !== undefined && value !== null && value !== '') {
        params[name] = String(value);
      }
    });

    this.templateEval.evaluateTemplateBindings(templateId, this.model.id, params).subscribe({
      next: (result: string) => {
        this.ModelDetailService.updateModelGraph(this.model.id, result, true).subscribe({
          next: () => this.openSnackBar('Template evaluated and added to model.'),
          error: (err) => console.error('Failed to append evaluated template to model', err),
        });
      },
      error: (err) => console.error('Failed to evaluate template', err),
    });
  }

  updateGraphWithFile(event: Event) {
    this.updatingGraphSpinner = true;
    const element = event.currentTarget as HTMLInputElement;
    let files: FileList | null = element.files;
    const fileToUpload = files?.item(0) ?? null;

    if (!fileToUpload) return;

    this.ModelDetailService.updateModelGraph(this.model.id, fileToUpload, true)
    .subscribe({
      next: (data: string) => {
        this.graph = data;
        this.graphFormControl.setValue(this.graph);
        this.openSnackBar("success")
      }, // success path
      error: (error) => {
        this.openSnackBar("error")
      }, // error path
      complete: () => {
        this.updatingGraphSpinner = false;
      }
    });
  }
}
