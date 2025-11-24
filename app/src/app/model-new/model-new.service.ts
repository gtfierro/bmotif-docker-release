import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Model } from '../types'
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { handleError } from '../handle-error';
import { API_URL } from '../env';

@Injectable({
  providedIn: 'root'
})
export class ModelNewService {

  constructor(private http: HttpClient) { }

  createModel(name: string, description: string): Observable<Model | any> {
    const headers = {'Content-Type': "application/json"}

    return this.http.post(API_URL + `/models`, {name: name, description: description}, {headers, responseType: 'json'})
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }

  updateGraphWithFile(modelId: number, file: File): Observable<any> {
    const formData: FormData = new FormData();
    formData.append('file', file);

    return this.http.patch(API_URL + `/models/${modelId}/graph`, formData, { responseType: 'text' })
      .pipe(
        catchError(handleError)
      );
  }

  getModels(): Observable<Model[]> {
    return this.http.get<Model[]>(API_URL + `/models`)
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }
}
