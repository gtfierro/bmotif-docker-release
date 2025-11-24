import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { Mapping } from './mapping.model';
import { API_URL } from '../env';

function handleError(error: HttpErrorResponse) {
  if (error.status === 0) {
    console.error('An error occurred:', error.error);
  } else {
    console.error(`Backend returned code ${error.status}, body was: `, error.error);
  }
  return throwError(() => new Error('Something bad happened; please try again later.'));
}

@Injectable()
export class MappingService {

  constructor(private http: HttpClient) { }

  getMappings(): Observable<Mapping[]> {
    return this.http.get<Mapping[]>(API_URL + '/mappings/')
      .pipe(
        retry(3),
        catchError(handleError)
      );
  }

  saveMappings(mappings: Mapping[]): Observable<any> {
    return this.http.post(API_URL + '/mappings/', mappings)
      .pipe(
        catchError(handleError)
      );
  }

  uploadCsv(file: File): Observable<any> {
    const formData: FormData = new FormData();
    formData.append('file', file, file.name);

    return this.http.post(API_URL + '/mappings/upload_csv', formData)
      .pipe(
        catchError(handleError)
      );
  }

  suggestClass(description: string): Observable<{point: string | null, equip: string | null}> {
    return this.http.post<{point: string | null, equip: string | null}>(API_URL + '/mappings/suggest/', { description })
      .pipe(
        catchError(handleError)
      );
  }

  downloadCsv(): Observable<Blob> {
    return this.http.get(API_URL + '/mappings/download_csv', { responseType: 'blob' })
      .pipe(
        catchError(handleError)
      );
  }
}
