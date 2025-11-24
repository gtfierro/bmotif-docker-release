import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subscription, of, from} from 'rxjs';
import { mergeMap, concatMap, map, mergeAll, toArray} from 'rxjs/operators';
import { catchError } from 'rxjs/operators';
import { LibraryService, Library, Template } from '../library/library.service';


export interface TemplateResult {
  template: string;
}

@Injectable({
  providedIn: 'root'
})
export class PointListService {

  constructor(private http: HttpClient) { }

  getLibraries(): Observable<Library[]> {
    return this.http.get<Library[]>('http://localhost:5000/libraries')
      .pipe(
        catchError(error => {
          console.error('Error occurred:', error);
          throw error;
        })
      );
  }

  getTemplate(templateId: number): Observable<Template> {
    return this.http.get<Template>(`http://localhost:5000/templates/${templateId}`)
      .pipe(
        catchError(error => {
          console.error('Error occurred:', error);
          throw error;
        })
      );
  }


  getTemplates(libraryName: string): Observable<Template[]> {

    return this.getLibraries().pipe(
        concatMap((libraries: Library[]) => {
            const library = libraries.find((lib) => lib.name === libraryName);
            if(!library) {
                throw new Error('Library not found');
            }
            // get the library with expanded templates
            const templateObservables: Observable<Template>[] = library?.template_ids?.map((templateId: number) => {
                return this.getTemplate(templateId);
            }) || [];
            // Use the 'from' operator to convert the array of Observables into an Observable sequence
            return from(templateObservables);
        }),
        // Use 'mergeAll' to flatten the Observable<Observable<string>[]> into Observable<string>
        mergeAll(),
        toArray(),
        catchError(error => {
            console.error('Error occurred:', error);
            throw error;
        })
    );
}
  //getTemplates(libraryName: string): Subscription {
  //  // get all libraries from a GET on /libraries . Then loop through them to find the one whose name matches the libraryName.
  //  // Then get the templates from that library.
  //  console.log('LibraryName', libraryName);
  //  return this.http.get<Library[]>('http://localhost:5000/libraries')
  //    .subscribe({
  //      next: (libraries: Library[]) => {
  //        console.log('Libraries', libraries);
  //        const library = libraries.find((lib) => lib.name === libraryName);

  //        // if library is not found, return an empty array
  //        return library?.templates?.map((template: Template) => template.name) || [];
  //      },
  //      error: (error) => {
  //        console.error('Error getting libraries', error);
  //        return [];
  //      }
  //    });
  //}

  sendFile(pointListCSV: File, templateName: string, libraryName: string, targetClass: string, overwrite: boolean): Observable<TemplateResult | any> {
    const formData: FormData = new FormData();
    formData.append('file', pointListCSV);
    formData.append('template_name', templateName);
    formData.append('library_name', libraryName);
    formData.append('target_class', targetClass);

    formData.append('overwrite', String(overwrite));

    return this.http.post('http://localhost:5000/pointlist-to-template', formData)
      .pipe(
        catchError(error => {
          console.error('Error occurred:', error);
          throw error;
        })
      );
  }
 }
