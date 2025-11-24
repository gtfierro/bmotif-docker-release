import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HttpErrorResponse, HttpResponse } from '@angular/common/http';

import { Observable, throwError } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
import { handleError } from '../handle-error';
import { API_URL } from '../env';

export interface Library {
  name: string;
  id: number;
  shape_collection_id: number;
  template_ids?: number[];
  templates?: Template[];
}

export interface Template {
  name: string;
  id: number;
  body_id: number;
  optional_args: string[];
  library_id: string;
  dependency_ids: number[];
}

export interface Shape {
  library_name: string;
  shape_uri: string;
  shape_collection_id: number
  label: string;
}

export interface BrickClass {
  uri: string;
  label: string | null;
  definition: string | null;
}

@Injectable()
export class LibraryService {

  constructor(private http: HttpClient) { }

  getAllLibraries() {
    console.log('Fetching libraries from:', API_URL + `/libraries`);
    return this.http.get<Library[]>(API_URL + `/libraries`)
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }

  getAllShapes() {
    return this.http.get<{[definition_type: string]: Shape[]}>(API_URL + `/libraries/shapes`)
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError) // then handle the error
      );
  }

  getLibrarysTemplates(library_id: number) {
    return this.http.get<Library>(API_URL + `/libraries/${library_id}?expand_templates=True`)
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError), // then handle the error
      );
  }

  getLibraryClasses(library_id: number, subclasses_of?: string) {
    let url = API_URL + `/libraries/${library_id}/classes`;
    if (subclasses_of) {
      url += `?subclasses_of=${encodeURIComponent(subclasses_of)}`;
    }
    return this.http.get<BrickClass[]>(url)
      .pipe(
        retry(3), // retry a failed request up to 3 times
        catchError(handleError), // then handle the error
      );
  }
}
