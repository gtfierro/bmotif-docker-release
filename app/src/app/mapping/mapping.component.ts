import { Component, OnInit, ViewChild } from '@angular/core';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatTableDataSource } from '@angular/material/table';
import { MatSort } from '@angular/material/sort';
import { forkJoin } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { MappingService } from './mapping.service';
import { Mapping } from './mapping.model';
import { LibraryService, BrickClass } from '../library/library.service';

@Component({
  selector: 'app-mapping',
  templateUrl: './mapping.component.html',
  styleUrls: ['./mapping.component.css']
})
export class MappingComponent implements OnInit {
  displayedColumns: string[] = ['abbreviation', 'description', 'brick_point_class', 'brick_equip_class', 'brick_location_class', 'actions'];
  dataSource: MatTableDataSource<Mapping> = new MatTableDataSource<Mapping>();
  @ViewChild(MatSort) sort!: MatSort;
  brickPointClasses: BrickClass[] = [];
  brickEquipClasses: BrickClass[] = [];
  brickLocationClasses: BrickClass[] = [];
  filteredBrickPointClasses: BrickClass[] = [];
  filteredBrickEquipClasses: BrickClass[] = [];
  filteredBrickLocationClasses: BrickClass[] = [];
  suggestingClassesFor = new Set<Mapping>();
  isSuggestingAll = false;
  isDirty = false;

  constructor(private mappingService: MappingService, private libraryService: LibraryService) { }

  ngOnInit(): void {
    this.loadMappings();
    this.loadBrickClasses();
  }

  loadBrickClasses(): void {
    const cachedPointClasses = sessionStorage.getItem('brickPointClasses');
    const cachedEquipClasses = sessionStorage.getItem('brickEquipClasses');
    const cachedLocationClasses = sessionStorage.getItem('brickLocationClasses');

    if (cachedPointClasses && cachedEquipClasses && cachedLocationClasses) {
      this.brickPointClasses = JSON.parse(cachedPointClasses);
      this.filteredBrickPointClasses = this.brickPointClasses;
      this.brickEquipClasses = JSON.parse(cachedEquipClasses);
      this.filteredBrickEquipClasses = this.brickEquipClasses;
      this.brickLocationClasses = JSON.parse(cachedLocationClasses);
      this.filteredBrickLocationClasses = this.brickLocationClasses;
    } else {
      this.libraryService.getAllLibraries().subscribe(libraries => {
        const brickLibrary = libraries.find(lib => lib.name === 'https://brickschema.org/schema/1.4/Brick');
        if (brickLibrary) {
          this.libraryService.getLibraryClasses(brickLibrary.id, 'https://brickschema.org/schema/Brick#Point').subscribe(classes => {
            this.brickPointClasses = classes;
            this.filteredBrickPointClasses = classes;
            sessionStorage.setItem('brickPointClasses', JSON.stringify(classes));
          });
          this.libraryService.getLibraryClasses(brickLibrary.id, 'https://brickschema.org/schema/Brick#Equipment').subscribe(classes => {
            this.brickEquipClasses = classes;
            this.filteredBrickEquipClasses = classes;
            sessionStorage.setItem('brickEquipClasses', JSON.stringify(classes));
          });
          this.libraryService.getLibraryClasses(brickLibrary.id, 'https://brickschema.org/schema/Brick#Location').subscribe(classes => {
            this.brickLocationClasses = classes;
            this.filteredBrickLocationClasses = classes;
            sessionStorage.setItem('brickLocationClasses', JSON.stringify(classes));
          });
        } else {
          console.error("Brick library not found.");
        }
      });
    }
  }

  loadMappings(): void {
    this.mappingService.getMappings().subscribe(mappings => {
      this.dataSource.data = mappings;
      this.dataSource.sort = this.sort;
      this.isDirty = false;
    });
  }

  saveMappings(): void {
    this.mappingService.saveMappings(this.dataSource.data).subscribe({
      next: () => {
        console.log('Mappings saved successfully');
        this.isDirty = false;
      },
      error: (err) => console.error('Error saving mappings', err)
    });
  }

  markAsDirty(): void {
    this.isDirty = true;
  }

  addRow(): void {
    const newMapping: Mapping = {
      abbreviation: '',
      description: '',
      brick_point_class: null,
      brick_equip_class: null,
      brick_location_class: null
    };
    this.dataSource.data = [newMapping, ...this.dataSource.data];
    this.markAsDirty();
  }

  deleteRow(mappingToDelete: Mapping): void {
    this.dataSource.data = this.dataSource.data.filter(mapping => mapping !== mappingToDelete);
    this.markAsDirty();
  }

  suggestAll(): void {
    const mappingsToSuggest = this.dataSource.data.filter(
      m => m.description && (!m.brick_point_class || !m.brick_equip_class) && !this.suggestingClassesFor.has(m)
    );

    if (mappingsToSuggest.length === 0) {
      return;
    }

    this.isSuggestingAll = true;

    const suggestionObservables = mappingsToSuggest.map(m => {
      this.suggestingClassesFor.add(m);
      return this.mappingService.suggestClass(m.description!).pipe(
        tap(suggestion => {
          if (suggestion) {
            if (suggestion.point && !m.brick_point_class) {
              m.brick_point_class = suggestion.point;
            }
            if (suggestion.equip && !m.brick_equip_class) {
              m.brick_equip_class = suggestion.equip;
            }
          }
        }),
        finalize(() => {
          this.suggestingClassesFor.delete(m);
        })
      );
    });

    forkJoin(suggestionObservables).pipe(
      finalize(() => {
        this.isSuggestingAll = false;
        this.dataSource.data = [...this.dataSource.data]; // Refresh table
        this.markAsDirty();
      })
    ).subscribe({
      error: err => console.error('Error during suggest all', err)
    });
  }

  suggestClass(element: Mapping): void {
    if (!element.description || this.suggestingClassesFor.has(element)) {
      return;
    }
    this.suggestingClassesFor.add(element);
    this.mappingService.suggestClass(element.description).pipe(
      finalize(() => this.suggestingClassesFor.delete(element))
    ).subscribe({
      next: (suggestion) => {
        if (suggestion) {
          if (suggestion.point) {
            element.brick_point_class = suggestion.point;
          }
          if (suggestion.equip) {
            element.brick_equip_class = suggestion.equip;
          }
          // The inputs won't auto-update their display value, so we do it manually.
          // This is a bit of a hack, but it forces the view to refresh with the new labels.
          this.dataSource.data = [...this.dataSource.data];
          this.markAsDirty();
        }
      },
      error: (err) => console.error('Error getting suggestion', err)
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length) {
      const file = input.files[0];
      this.mappingService.uploadCsv(file).subscribe({
        next: () => {
          console.log('File uploaded successfully');
          this.loadMappings();
        },
        error: (err) => console.error('Error uploading file', err)
      });
    }
  }

  downloadCsv(): void {
    this.mappingService.downloadCsv().subscribe(blob => {
      const a = document.createElement('a');
      const objectUrl = URL.createObjectURL(blob);
      a.href = objectUrl;
      a.download = 'mappings.csv';
      a.click();
      URL.revokeObjectURL(objectUrl);
    });
  }

    getBrickLabel(uri: string | null): string {
      if (!uri) {
        return '';
      }
      const allClasses = [...this.brickPointClasses, ...this.brickEquipClasses, ...this.brickLocationClasses];
      const foundClass = allClasses.find(c => c.uri === uri);
      return foundClass?.label || uri;
    }

    private _filterClasses(value: string, classes: BrickClass[]): BrickClass[] {
      const searchTerms = value.trim().toLowerCase().split(/\s+/).filter(term => term);

      if (searchTerms.length === 0) {
        return classes;
      }

      return classes.filter(c => {
        const classText = (c.label || c.uri).toLowerCase();
        return searchTerms.every(term => classText.includes(term));
      });
    }

    filterPointClasses(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      this.filteredBrickPointClasses = this._filterClasses(value, this.brickPointClasses);
    }

    filterEquipClasses(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      this.filteredBrickEquipClasses = this._filterClasses(value, this.brickEquipClasses);
    }

    filterLocationClasses(event: Event) {
      const value = (event.target as HTMLInputElement).value;
      this.filteredBrickLocationClasses = this._filterClasses(value, this.brickLocationClasses);
    }

    onAutocompleteOpened(type: 'point' | 'equip' | 'location') {
        if (type === 'point') this.filteredBrickPointClasses = this.brickPointClasses;
        if (type === 'equip') this.filteredBrickEquipClasses = this.brickEquipClasses;
        if (type === 'location') this.filteredBrickLocationClasses = this.brickLocationClasses;
    }

    onClassSelected(event: MatAutocompleteSelectedEvent, element: Mapping, property: 'brick_point_class' | 'brick_equip_class' | 'brick_location_class', input: HTMLInputElement) {
      element[property] = event.option.value;
      input.value = this.getBrickLabel(element[property]);
      this.markAsDirty();
    }

    onAutocompleteBlur(input: HTMLInputElement, element: Mapping, property: 'brick_point_class' | 'brick_equip_class' | 'brick_location_class') {
      setTimeout(() => {
        input.value = this.getBrickLabel(element[property]);
      }, 150);
    }
}
