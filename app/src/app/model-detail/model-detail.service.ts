import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Model } from '../types'
import { Observable, throwError, forkJoin } from 'rxjs';
import { catchError, retry, map } from 'rxjs/operators';
import { handleError } from '../handle-error';
import { API_URL } from '../env';
import { Library, Template, LibraryService } from '../library/library.service';

@Injectable({
  providedIn: 'root'
})
export class ModelDetailService {

  constructor(private http: HttpClient, private libraryService: LibraryService) { }

  getModel(id: number) {
    return this.http.get<Model>(API_URL + `/models/${id}`)
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }

  getModelGraph(id: number) {
    return this.http.get(API_URL + `/models/${id}/graph`, {responseType: 'text'})
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }

  getManifest(id: number) {
    const headers = { 'Accept': 'application/json' };
    return this.http.get<{ body: string; library_uris?: string[] } | string>(API_URL + `/models/${id}/manifest`, { headers })
      .pipe(
        map((res: any) => typeof res === 'string' ? res : (res?.body ?? '')),
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }

  // Return IDs of libraries imported in the model's manifest (API returns { library_ids })
  getManifestLibraries(id: number): Observable<number[]> {
    return this.http.get<{ library_ids: number[] } | number[]>(API_URL + `/models/${id}/manifest/imports`)
      .pipe(
        map((res: any) => Array.isArray(res) ? res as number[] : (res?.library_ids ?? [])),
        retry(3),
        catchError(handleError)
      );
  }

  // Update manifest with selected libraries per API.md (POST, JSON { library_ids }, returns TTL)
  updateManifestSelections(id: number, library_ids: number[]): Observable<string> {
    const headers = { 'Content-Type': 'application/json', 'Accept': 'text/turtle' };
    return this.http.post(
      API_URL + `/models/${id}/manifest`,
      { library_ids },
      { headers, responseType: 'text' }
    ).pipe(
      retry(3),
      catchError(handleError)
    );
  }

  // Overwrite manifest by posting TTL directly
  updateManifestTTL(id: number, ttl: string): Observable<string> {
    const headers = { 'Content-Type': 'text/turtle', 'Accept': 'text/turtle' };
    return this.http.post(
      API_URL + `/models/${id}/manifest`,
      ttl,
      { headers, responseType: 'text' }
    ).pipe(
      retry(3),
      catchError(handleError)
    );
  }

  // Create a new library from uploaded rules JSON (backend transforms to SHACL shapes and registers as a library)
  // Endpoint returns: { library: string } (the name of the created library)
  createLibraryFromRules(file: File, name?: string): Observable<{ library: string }> {
    const formData = new FormData();
    formData.append('file', file);
    if (name) formData.append('name', name);
    return this.http.post<{ library: string }>(
      API_URL + `/transform/libraries/from_rules`,
      formData
    ).pipe(
      retry(3),
      catchError(handleError)
    );
  }

  // Expose library reads here to avoid adding extra injected services in component
  getAllLibraries(): Observable<Library[]> {
    return this.libraryService.getAllLibraries();
  }

  getLibrarysTemplates(library_id: number): Observable<Library> {
    return this.libraryService.getLibrarysTemplates(library_id);
  }

  getTargetNodes(id: number) {
    return this.http.get<string[]>(API_URL + `/models/${id}/target_nodes`)
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }

  updateModelGraph(id: number, newGraph: string | File, append: boolean = false) {
    const headers = {'Content-Type': "application/xml"}

    return this.http[append? "patch": "put"](API_URL + `/models/${id}/graph`, newGraph, {headers, responseType: 'text'})
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
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
