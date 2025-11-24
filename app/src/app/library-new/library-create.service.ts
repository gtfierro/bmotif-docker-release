import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, retry, catchError } from 'rxjs';
import { API_URL } from '../env';
import { handleError } from '../handle-error';

@Injectable()
export class LibraryCreateService {
  constructor(private http: HttpClient) {}

  // POST TTL as a new library; expects backend to accept multipart/form-data with fields:
  // - file: the TTL file
  // - name: the library name
  createFromTTL(file: File, name: string): Observable<{ id?: number; name?: string }> {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    return this.http.post<{ id?: number; name?: string }>(
      API_URL + `/libraries`,
      form
    ).pipe(
      retry(2),
      catchError(handleError)
    );
  }

  // POST rules.json for transformation into a library; backend returns { library: string }
  createFromRules(file: File, name?: string): Observable<{ library: string }> {
    const form = new FormData();
    form.append('file', file);
    if (name) form.append('name', name);
    return this.http.post<{ library: string }>(
      API_URL + `/transform/libraries/from_rules`,
      form
    ).pipe(
      retry(2),
      catchError(handleError)
    );
  }
}
