import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { DemoStateService, ParseResults } from '../demostate.service';

@Injectable({
  providedIn: 'root'
})
export class ModelGenerationService {

  constructor(private http: HttpClient, private demoState: DemoStateService) { }

  sendFile(pointListCSV: File, parser: string): Observable<any> {
    const formData: FormData = new FormData();
    formData.append('file', pointListCSV);
    // wrap the parser source code in a File object
    console.log('parser', parser);
    const parserBlob = new Blob([JSON.stringify(parser)], { type: 'text/plain' });
    formData.append('parser', parserBlob, 'parser.py');

    return this.http.post('http://localhost:5000/model-generation', formData)
      .pipe(
        tap((response: any) => {
          const parseResults: ParseResults = {
            errors: response.errors,
            unmatched_suffixes: response.unmatched_suffixes,
          };
          this.demoState.setParseResults(parseResults);
          return response;
        }),
        catchError(error => {
          console.error('Error occurred:', error);
          throw error;
        })
      );
  }
}
