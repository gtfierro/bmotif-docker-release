import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';


export interface AppliedRuleResult {
  rule: string;
  focus_node: string;
  details: any;
  success: boolean;
}

export interface Response {
  results: AppliedRuleResult[];
  report: string;
}

@Injectable({
  providedIn: 'root'
})
export class RulesService {

  constructor(private http: HttpClient) { }

  sendFiles(modelID: number, rulesJson: File):  Observable<Response | any> {

    const formData: FormData = new FormData();
    formData.append('rulesJson', rulesJson);
    formData.append('modelID', modelID.toString());

    return this.http.post('http://localhost:5000/transform', formData)
      .pipe(
        catchError(this.handleError) // then handle the error
      );
  }

  exportAFXML(modelID: number, rulesJson: File, piServer: string, piDatabase: string, piExportPath?: string, piImportPath?: string): Observable<Blob | any> {
    const formData: FormData = new FormData();
    formData.append('rulesJson', rulesJson);
    formData.append('modelID', modelID.toString());
    formData.append('piServer', piServer);
    formData.append('piDatabase', piDatabase);
    if (piExportPath) formData.append('piExportPath', piExportPath);
    if (piImportPath) formData.append('piImportPath', piImportPath);

    return this.http.post('http://localhost:5000/transform/afxml', formData, { responseType: 'blob' as 'json' })
      .pipe(
        catchError(this.handleError)
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


