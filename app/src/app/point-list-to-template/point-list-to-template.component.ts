import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { DemoStateService } from '../demostate.service';
import { PointListService, TemplateResult } from './point-list-to-template.service';
import { Template, LibraryService, BrickClass } from '../library/library.service';

@Component({
  selector: 'app-point-list-to-template',
  templateUrl: './point-list-to-template.component.html',
  styleUrls: ['./point-list-to-template.component.css']
})
export class PointListToTemplateComponent implements OnInit {
  @ViewChild('equipInput') equipInput!: ElementRef;
  pointListCSV: File | null = null;
  isLoading: boolean = false;
  isFormComplete(): boolean {
    return !!this.pointListCSV && !!this.libraryName && !!this.templateName && !!this.targetClass;
  }
  libraryName: string = 'asbuilt-lib';
  targetClass: string = 'https://brickschema.org/schema/Brick#Variable_Air_Volume_Box';
  brickEquipmentClasses: BrickClass[] = [];
  filteredBrickEquipmentClasses: BrickClass[] = [];

  constructor(
    private pointListService: PointListService,
    private demoStateService: DemoStateService,
    private libraryService: LibraryService
  ) {}

  ngOnInit(): void {
    console.log(this.demoStateService.getPointscheduleCSV());
    this.pointListCSV = this.demoStateService.getPointscheduleCSV();
    console.log('pointListCSV', this.pointListCSV);
    this.getTemplates();
    this.loadBrickClasses();
  }
  template: string | null = null;
  templateName: string | null = null;
  overwrite: boolean = false;
  templatesList: Template[] = [];

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.pointListCSV = input.files[0];
    }
  }

  regenerate() {
    this.template = null;
    this.sendFile();
  }

  getTemplates() {
    return this.pointListService.getTemplates(this.libraryName).subscribe({
      next: (data: Template[]) => {
        this.templatesList = data;
        console.log('TemplatesList', this.templatesList);
      },
      error: (error) => {
        console.error('Error getting templates', error);
      }
    });
  }

  loadBrickClasses(): void {
    this.libraryService.getAllLibraries().subscribe(libraries => {
      const brickLibrary = libraries.find(lib => lib.name === 'https://brickschema.org/schema/1.4/Brick');
      if (brickLibrary) {
        this.libraryService.getLibraryClasses(brickLibrary.id, 'https://brickschema.org/schema/Brick#Equipment').subscribe(classes => {
          this.brickEquipmentClasses = classes;
          this.filteredBrickEquipmentClasses = classes;
          if (this.equipInput) {
            this.equipInput.nativeElement.value = this.getBrickLabel(this.targetClass);
          }
        });
      } else {
        console.error("Brick library not found.");
      }
    });
  }

  sendFile() {
    if (!this.pointListCSV || !this.libraryName || !this.templateName) {
      console.error('PointListCSV or LibraryName is missing');
      return;
    }
    if (!this.pointListCSV) return;
    this.template = null; // reset template so that the old template is not shown
    this.isLoading = true;
    const targetClassName = this.targetClass.split('#').pop() || '';
    this.pointListService.sendFile(this.pointListCSV, this.templateName, this.libraryName, targetClassName, this.overwrite).subscribe({
      next: (data: TemplateResult) => {
        this.template = data.template;
        console.log(this.template);
        console.log('File processed successfully', data);
        this.getTemplates();
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error processing file', error);
      }
    });
  }

  getBrickLabel(uri: string | null): string {
    if (!uri) {
      return '';
    }
    const foundClass = this.brickEquipmentClasses.find(c => c.uri === uri);
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

  filterEquipClasses(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.filteredBrickEquipmentClasses = this._filterClasses(value, this.brickEquipmentClasses);
  }

  onAutocompleteOpened() {
    this.filteredBrickEquipmentClasses = this.brickEquipmentClasses;
  }

  onClassSelected(event: MatAutocompleteSelectedEvent, input: HTMLInputElement) {
    this.targetClass = event.option.value;
    input.value = this.getBrickLabel(this.targetClass);
  }

  onAutocompleteBlur(input: HTMLInputElement) {
    setTimeout(() => {
      input.value = this.getBrickLabel(this.targetClass);
    }, 150);
  }
}
