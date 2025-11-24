import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class ManifestGenerationService {

  constructor(private http: HttpClient) { }

  sendFile(equipschedCSV: File, modelId: number, namespace: string): Observable<any> {
    const formData: FormData = new FormData();
    formData.append('file', equipschedCSV);
    formData.append('modelId', modelId.toString());
    formData.append('namespace', namespace);
    console.log('Sending file:', equipschedCSV, modelId, namespace);

    return this.http.post('http://localhost:5000/manifest-generation', formData)
      .pipe(
        catchError(error => {
          console.error('Error occurred:', error);
          throw error;
        })
      );
  }
}
