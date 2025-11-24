import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DemoStateService } from '../demostate.service';
import { ModelSearchService } from '../model-search/model-search.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Model } from '../types';
import { ManifestGenerationService } from './manifest-generate.service';

@Component({
  selector: 'app-manifest-generate',
  templateUrl: './manifest-generate.component.html',
  styleUrls: ['./manifest-generate.component.css']
})
export class ManifestGenerateComponent implements OnInit {
  equipschedCSV: File | null = null;
  turtleString: string | null = null;
  saveManifestForm = new FormGroup({
    nameControl: new FormControl("", [Validators.required]),
    namespaceControl: new FormControl("", [Validators.required]),
  });
  models: Model[] = [];
  selectedModelId: number | null = null;
  namespace: string = "urn:equipment_manifest";
  isLoading: boolean = false;

  constructor(
    private manifestGenerationService: ManifestGenerationService,
    private demoStateService: DemoStateService,
    private modelSearchService: ModelSearchService,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.equipschedCSV = this.demoStateService.getEquipmentScheduleCSV();
    this.modelSearchService.getAllModels().subscribe({
      next: (models) => {
        this.models = models;
        this.isLoading = false;
      },
      error: (error) => {
        console.error('Error fetching models:', error);
        this.isLoading = false;
      }
    });
  }

  handleEquipmentScheduleCSVInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.equipschedCSV = input.files?.[0] ?? null;
  }

  sendFile() {
    console.log(this.equipschedCSV, this.selectedModelId, this.namespace);
    if (!this.equipschedCSV || !this.selectedModelId || !this.namespace) return;
    this.isLoading = true;
    this.manifestGenerationService.sendFile(this.equipschedCSV, this.selectedModelId, this.namespace).subscribe({
      next: (data) => {
        this.turtleString = data.manifest;
        this.isLoading = false;
        console.log('File processed successfully', data);
      },
      error: (error) => {
        this.isLoading = false;
        console.error('Error processing file', error);
      }
    });
  }

  saveManifest() {
    const name = this.saveManifestForm.value.nameControl;

    if (!name || !this.turtleString) return;
    // Logic to save the manifest
  }
}
