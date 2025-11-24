import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';


export interface ParseToken {
  identifier: string;
  type: string;
}

export interface SuccessfulPointParse {
  label: string;
  tokens: ParseToken[];
}

export interface FailedPointParse {
  unparsed_suffix: string;
  labels: string[];
}

export interface ParseResult {
    failed: FailedPointParse[];
    parsed: SuccessfulPointParse[];
}

@Injectable({
  providedIn: 'root'
})
export class ParserService {

  constructor(private http: HttpClient) { }

  sendFiles(pointlabelCSV: File, parserJson: File):  Observable<ParseResult | any> {

    const formData: FormData = new FormData();
    formData.append('files[]', pointlabelCSV);
    formData.append('files[]', parserJson);

    return this.http.post('http://localhost:5000/naming', formData)
      .pipe(
        catchError(this.handleError) // then handle the error
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


