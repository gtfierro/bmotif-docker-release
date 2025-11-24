import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { Model } from '../types'
import { throwError, of, Subject } from 'rxjs';
import { catchError, retry, tap } from 'rxjs/operators';
import { handleError } from '../handle-error';
import { API_URL } from '../env';
@Injectable({
  providedIn: 'root'
})
export class ModelValidateService {

  // Cache validation results by model ID (manifest-based validations only)
  private validationCache = new Map<number, ValidationResponse>();
  private templatesCache = new Map<number, SuggestedTemplate[]>();
  private templatesSubject = new Subject<{ modelId: number; templates: SuggestedTemplate[] }>();
  public templates$ = this.templatesSubject.asObservable();

  constructor(private http: HttpClient) { }

  // LocalStorage persistence keys and helpers
  private readonly LS_PREFIX = 'ModelValidateService:v1:';
  private valKey(modelId: number): string { return `${this.LS_PREFIX}${modelId}:validation`; }
  private tplKey(modelId: number): string { return `${this.LS_PREFIX}${modelId}:templates`; }

  private persistValidation(modelId: number, resp: ValidationResponse): void {
    try { localStorage.setItem(this.valKey(modelId), JSON.stringify(resp)); } catch {}
  }

  private persistTemplates(modelId: number, templates: SuggestedTemplate[]): void {
    try { localStorage.setItem(this.tplKey(modelId), JSON.stringify(templates)); } catch {}
  }

  private readPersistedValidation(modelId: number): ValidationResponse | undefined {
    try {
      const raw = localStorage.getItem(this.valKey(modelId));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return parsed as ValidationResponse;
    } catch { return undefined; }
  }

  private readPersistedTemplates(modelId: number): SuggestedTemplate[] | undefined {
    try {
      const raw = localStorage.getItem(this.tplKey(modelId));
      if (!raw) return undefined;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed as SuggestedTemplate[] : undefined;
    } catch { return undefined; }
  }

  private removePersisted(modelId: number): void {
    try {
      localStorage.removeItem(this.valKey(modelId));
      localStorage.removeItem(this.tplKey(modelId));
    } catch {}
  }

  private clearAllPersisted(): void {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.LS_PREFIX)) {
          localStorage.removeItem(key);
        }
      }
    } catch {}
  }

  validateModel(modelId: number, args?: number[], options?: { force?: boolean }) {
    const headers = {'Content-Type': "application/json"};
    const hasArgs = Array.isArray(args) && args.length > 0;
    const body = hasArgs ? {"library_ids": args} : {};
    const force = !!options?.force;

    // Serve from cache when validating against manifest (no args) and not forcing
    if (!hasArgs && !force) {
      const cached = this.validationCache.get(modelId) ?? this.readPersistedValidation(modelId);
      if (cached) {
        // hydrate in-memory caches
        this.validationCache.set(modelId, cached);
        const templates = (cached.templates ?? this.readPersistedTemplates(modelId) ?? []);
        if (Array.isArray(templates) && templates.length) {
          this.templatesCache.set(modelId, templates);
          this.templatesSubject.next({ modelId, templates });
        } else {
          this.templatesSubject.next({ modelId, templates: [] });
        }
        return of(cached);
      }
    }

    return this.http.post<ValidationResponse>(
        API_URL + `/models/${modelId}/validate?min_iterations=1&max_iterations=2&include_templates=true`,
        body,
        {headers, responseType: 'json'}
      )
      .pipe(
        tap((res: ValidationResponse) => {
          const templates = Array.isArray(res?.templates) ? res.templates : [];
          // Normalize and enforce valid numeric IDs; drop any without an ID
          const normalized = templates
            .map((t: any) => {
              const raw = t?.id ?? t?.template_id;
              const idNum = typeof raw === 'string' ? parseInt(raw, 10) : raw;
              if (typeof idNum !== 'number' || !Number.isFinite(idNum)) {
                return null; // exclude templates without a usable id
              }
              return { ...t, id: idNum, template_id: idNum };
            })
            .filter((x: any): x is SuggestedTemplate => !!x);

          // print templates
          console.log(`Validation returned ${normalized.length} templates for model ${modelId}`);
          console.log(normalized);
          this.templatesCache.set(modelId, normalized);
          this.templatesSubject.next({ modelId, templates: normalized });

          // Preserve full response including normalized templates in cache
          const normalizedRes: ValidationResponse = { ...(res as any), templates: normalized as any };
          this.validationCache.set(modelId, normalizedRes);

          // Persist for durability across navigations/reloads
          this.persistTemplates(modelId, normalized);
          this.persistValidation(modelId, normalizedRes);
        }),
        retry(3),
        catchError(handleError)
      );
  }

  // Return templates saved from validateModel(include_templates=true)
  getValidationTemplates(modelId: number) {
    return of({ templates: this.getCachedTemplates(modelId) ?? [] } as ValidationTemplatesResponse);
  }

  // Helper to set cache after subscribers receive the response
  setValidationCache(modelId: number, resp: ValidationResponse): void {
    this.validationCache.set(modelId, resp);
  }

  getCachedValidation(modelId: number): ValidationResponse | undefined {
    const inMem = this.validationCache.get(modelId);
    if (inMem) return inMem;
    const persisted = this.readPersistedValidation(modelId);
    if (persisted) {
      this.validationCache.set(modelId, persisted);
    }
    return persisted;
  }

  getCachedTemplates(modelId: number): SuggestedTemplate[] | undefined {
    const inMem = this.templatesCache.get(modelId);
    if (inMem) return inMem;
    const persisted = this.readPersistedTemplates(modelId);
    if (persisted) {
      this.templatesCache.set(modelId, persisted);
    }
    return persisted;
  }

  clearValidationCache(modelId?: number): void {
    if (typeof modelId === 'number') {
      this.validationCache.delete(modelId);
      this.templatesCache.delete(modelId);
      this.removePersisted(modelId);
    } else {
      this.validationCache.clear();
      this.templatesCache.clear();
      this.clearAllPersisted();
    }
  }

  private handleError(error: HttpErrorResponse) {
    if (error.status === 0) {
      // A client-side or network error occurred. Handle it accordingly.
      console.error('An error occurred:', error.error);
    } else {
      // The backend returned an unsuccessful response code.
      // The response body may contain clues as to what went wrong.
      console.error(
        `Backend returned code ${error.status}, body was: `, error.error);
    }
    // Return an observable with a user-facing error message.
    return throwError(() => new Error(`${error.status}: ${error.error}`));
  }
}

export interface ValidationResponse {
    valid: boolean;
    message: string;
    reasons: { [focus_node_uri: string]: string[] };
    templates?: SuggestedTemplate[];
}

export interface SuggestedTemplateParameter {
  name: string;
  types: string[];
}

export interface SuggestedTemplate {
  id?: number;
  template_id?: number;
  body: string;
  parameters: SuggestedTemplateParameter[];
  focus?: string | null;
}

export interface ValidationTemplatesResponse {
  templates: SuggestedTemplate[];
}
