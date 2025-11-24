import { Component, OnInit } from '@angular/core';
import {FormControl, FormGroup, Validators} from '@angular/forms';
import { ModelNewService } from './model-new.service';
import { ModelGenerationService } from '../model-generation/model-generation.service';
import { ModelDetailService } from '../model-detail/model-detail.service';
import { DemoStateService } from '../demostate.service';
import {Router} from "@angular/router"
import { Model } from '../types';
import {MatSnackBar} from '@angular/material/snack-bar';

@Component({
  selector: 'app-model-new',
  templateUrl: './model-new.component.html',
  styleUrls: ['./model-new.component.css'],
  providers: [ModelNewService, ModelDetailService, ModelGenerationService, DemoStateService]
})
export class ModelNewComponent {
  modelTtl: File | null = null;
  pointlist: File | null = null;
  modelsList: Model[] = [];

  isLoading: boolean = false;

  newModelForm = new FormGroup({
    nameControl: new FormControl("", [Validators.required, noInValidCharacatersValidator]),
    descriptionControl: new FormControl("Example model for BuildingMOTIF demo"),
    modelTtlControl: new FormControl(""),
    pointlistControl: new FormControl(""),
  })


  constructor(
    private router: Router,
    private modelNewService: ModelNewService,
    private modelDetailService: ModelDetailService,
    private modelGenerationService: ModelGenerationService,
    private demoState: DemoStateService,
    private _snackBar: MatSnackBar
  ) { }

  ngOnInit(): void {
    this.getModels();
  }

  handleModelTtlInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.modelTtl = input.files?.[0] ?? null;
    if (this.modelTtl) {
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const extracted = this.tryExtractNameFromTTL(text);
        if (extracted) {
          this.newModelForm.get('nameControl')?.setValue(extracted);
        }
      };
      reader.readAsText(this.modelTtl);
    }
  }

  private tryExtractNameFromTTL(ttl: string): string | null {
    try {
      // Find subject of owl:Ontology triple
      const typeRegex = /^\s*([<][^>]+[>]|[A-Za-z_][\w.-]*:[\w.-]+)\s+(?:a|rdf:type)\s+owl:Ontology\b/m;
      const typeMatch = ttl.match(typeRegex);
      if (!typeMatch) return null;
      const subject = typeMatch[1];

      // Try common label predicates for a human-friendly name
      const predPatterns = [
        'rdfs:label',
        '<http://www.w3.org/2000/01/rdf-schema#label>',
        'dct:title',
        'dcterms:title',
        '<http://purl.org/dc/terms/title>'
      ];
      for (const pred of predPatterns) {
        const labelRegex = new RegExp('^\\s*' + subject.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\s+' + pred + '\\s+\\"([^\\"]+)\\"', 'm');
        const m = ttl.match(labelRegex);
        if (m) return m[1];
      }

      // Fallback: subject IRI or QName
      if (subject.startsWith('<') && subject.endsWith('>')) {
        return subject.slice(1, -1);
      }
      return subject;
    } catch {
      return null;
    }
  }

  getModels() {
    return this.modelNewService.getModels().subscribe({
      next: (data: Model[]) => {
        this.modelsList = data;
        console.log('ModelsList', this.modelsList);
      },
      error: (error) => {
        console.error('Error getting models', error);
      }
    });
  }

  handlePointlistInput(event: Event) {
    const input = event.target as HTMLInputElement;
    this.pointlist = input.files?.[0] ?? null;
  }

  createModel() {
    this.isLoading = true;
    let name = this.newModelForm.value.nameControl;
    // make sure name starts with 'urn:' and contains no non-url characters
    if (!name.startsWith("urn:")) {
      name = "urn:" + name;
    }
    // remove all non-url characters
    name = name.replace(/[^a-zA-Z0-9:\/\.\-_]/g, "_");

    const description = this.newModelForm.value.descriptionControl;

    if (!name) return;
    if (!description) return;

    this.modelNewService.createModel(name, description).subscribe({
      next: (newModel: Model) => {
        if (this.modelTtl) {
          console.log("updating model with TTL file", this.modelTtl);
          this.modelDetailService.updateModelGraph(newModel.id, this.modelTtl).subscribe({
            next: () => {
                  this.isLoading = false;
              this.router.navigate([`/models/${newModel.id}`]);
            },
            error: (error) => {
                  this.isLoading = false;
              this._snackBar.open('Error updating model with TTL file.', 'Close', {
                duration: 3000,
              });
            }
          });
        } else if (this.pointlist) {
          console.log("updating model with pointlist file and parser", this.pointlist, this.demoState.getParserSourcePy());
          this.modelGenerationService.sendFile(this.pointlist, this.demoState.getParserSourcePy()).subscribe({
            next: (data) => {
              console.log('File processed successfully', data);
              const turtleString = data.model;
              this.modelDetailService.updateModelGraph(newModel.id, turtleString).subscribe({
                next: () => {
                  this.isLoading = false;
                  this.router.navigate([`/models/${newModel.id}`]);
                },
                error: (error) => {
                  this.isLoading = false;
                  this._snackBar.open('Error updating model with generated data.', 'Close', {
                    duration: 3000,
                  });
                },
              });
            },
            error: (error) => {
              this._snackBar.open('Error generating model from pointlist.', 'Close', {
                duration: 3000,
              });
            }
          });
        } else {
          this.router.navigate([`/models/${newModel.id}`]);
        }
      },
      error: (error) => {
        this._snackBar.open(error, "close", {
          duration: 3000,
        });
        this.isLoading = false;
      },
    });
  }
}


function noInValidCharacatersValidator(control: FormControl) {
  const invalidCharacter = '<>" {}|\\^`';

  for (const c of control?.value.split("")) {
    if(invalidCharacter.includes(c)){
      return {
        invalidCharacter: "contains invalid characater: " + c
      }
    }
  }

  return null;
}
