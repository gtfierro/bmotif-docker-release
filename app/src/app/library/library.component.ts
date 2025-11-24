import { Component, OnInit } from '@angular/core';
import { Library, LibraryService } from './library.service';
import { FormControl } from '@angular/forms';
import { Observable, of } from 'rxjs';
import { map, startWith } from 'rxjs/operators';

@Component({
  selector: 'app-library',
  templateUrl: './library.component.html',
  styleUrls: ['./library.component.css'],
  providers: [LibraryService],
})
export class LibraryComponent implements OnInit {
  error: any;
  libraries: Library[] = [];
  filteredLibraries: Observable<Library[]> = of([]);
  filterStringControl: FormControl = new FormControl('');

  constructor(private libraryService: LibraryService) {}

  ngOnInit() {
    this.libraryService.getAllLibraries()
      .subscribe({
        next: (data: Library[]) => {
          this.libraries = data || [];
          this.setupFilter();
        },
        error: (error) => {
          this.error = error;
          this.libraries = [];
          this.setupFilter();
        }
      });
  }

  private setupFilter() {
    this.filteredLibraries = this.filterStringControl.valueChanges.pipe(
      startWith(''),
      map(value => this._filterLibraries(value || ''))
    );
  }

  private _filterLibraries(value: string): Library[] {
    const query = (value || '').toLowerCase();
    return this.libraries.filter(lib =>
      (lib.name || '').toLowerCase().includes(query) ||
      String(lib.id).includes(query)
    );
  }
}
