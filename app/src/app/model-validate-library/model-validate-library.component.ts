import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { LibraryService, Library } from '../library/library.service';
import { ModelValidateService, ValidationResponse } from '../model-validate/model-validate.service';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-model-validate-library',
  templateUrl: './model-validate-library.component.html',
  styleUrls: ['./model-validate-library.component.css'],
  providers: [LibraryService, ModelValidateService]
})
export class ModelValidateLibraryComponent implements OnInit {
  @Input() modelId!: number;
  libraries: Library[] = [];
  selectedLibrariesForm: FormGroup = new FormGroup({});
  validationResponse?: ValidationResponse;
  showValidatingSpinner = false;
  isLoading: boolean = false;

  constructor(
    private libraryService: LibraryService,
    private modelValidateService: ModelValidateService,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    console.log('Model ID:', this.modelId);
    this.libraryService.getAllLibraries().subscribe(
      (libraries) => {
        libraries.unshift({name: "Manifest", id: 0, shape_collection_id: -1});
        this.libraries = libraries;
        console.log('Fetched libraries:', this.libraries);
        this.initializeForm();
      },
      (error) => {
        console.error('Error fetching libraries:', error);
      },
      () => {
        this.isLoading = false;
      }
    );
  }

  isAnyLibrarySelected(): boolean {
    return Object.values(this.selectedLibrariesForm.value).some(value => value);
  }

  initializeForm(): void {
    const controls = this.libraries.reduce((acc, library) => {
      acc[library.id] = new FormControl(library.id === 0);
      return acc;
    }, {} as { [key: number]: FormControl });

    console.log('Form controls:', controls);
    this.selectedLibrariesForm = new FormGroup(controls, {
      validators: [Validators.requiredTrue],
    });
  }

  validateModel(): void {
    const selectedLibraryIds = this.libraries
      .filter((library) => this.selectedLibrariesForm.get(library.id.toString())?.value)
      .map((library) => library.id);

    this.showValidatingSpinner = true;
    this.isLoading = true;
    this.modelValidateService.validateModel(this.modelId, selectedLibraryIds).subscribe(
      (response) => {
        this.validationResponse = response;
        this._snackBar.open('Model validated successfully!', 'Close', {
          duration: 3000,
        });
      },
      (error) => {
        console.error('Error validating model:', error);
        this._snackBar.open('Error validating model.', 'Close', {
          duration: 3000,
        });
      },
      () => {
        this.showValidatingSpinner = false;
        this.isLoading = false;
      }
    );
  }
  selectAll(): void {
    this.libraries.forEach(library => {
      this.selectedLibrariesForm.get(library.id.toString())?.setValue(true);
    });
  }

  deselectAll(): void {
    this.libraries.forEach(library => {
      this.selectedLibrariesForm.get(library.id.toString())?.setValue(false);
    });
  }
}
