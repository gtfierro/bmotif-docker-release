import { Component, AfterViewInit, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { DemoStateService } from '../demostate.service';
import { ModelNewService } from '../model-new/model-new.service';
import { ModelDetailService  } from '../model-detail/model-detail.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import * as $rdf from 'rdflib';
import { ModelGenerationService } from './model-generation.service';
import { ModelNetworkComponent } from '../model-network/model-network.component';

@Component({
  selector: 'app-model-generation',
  templateUrl: './model-generation.component.html',
  styleUrls: ['./model-generation.component.css']
})
export class ModelGenerationComponent implements OnInit {
  pointListCSV: File | null = null;
  turtleString: string | null = null;
  saveModelForm = new FormGroup({
    nameControl: new FormControl("", [Validators.required]),
    descriptionControl: new FormControl(""),
  });

  constructor(
    private modelGenerationService: ModelGenerationService,
    private demoStateService: DemoStateService,
    private modelNewService: ModelNewService,
    private modelDetailService: ModelDetailService,
    private _snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.pointListCSV = this.demoStateService.getPointlistCSV();
    console.log('Loaded pointListCSV from DemoStateService:', this.pointListCSV);
  }

  ngAfterViewInit() {
    if (this.turtleString) {
      this.parseTurtleString(this.turtleString);
    }
  }

  parseTurtleString(turtleString: string) {
    const store = $rdf.graph();
    const contentType = 'text/turtle';
    $rdf.parse(turtleString, store, 'http://example.org/', contentType);
    console.log('Parsed RDF Graph:', store);
  }

  private addOntologyToTTL(name: string, description: string | null | undefined, ttl: string): string {
    try {
      const store = $rdf.graph();
      const base = 'http://example.org/';
      const contentType = 'text/turtle';
      $rdf.parse(ttl, store, base, contentType);

      const RDF = $rdf.Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
      const OWL = $rdf.Namespace('http://www.w3.org/2002/07/owl#');
      const RDFS = $rdf.Namespace('http://www.w3.org/2000/01/rdf-schema#');
      const DCTERMS = $rdf.Namespace('http://purl.org/dc/terms/');

      // Check if an ontology already exists
      const existingOntology = store.any(undefined, RDF('type'), OWL('Ontology'));

      const safeSlug = (name || 'model').toString()
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\-]+/gi, '-')
        .replace(/^-+|-+$/g, '');
      const subj = existingOntology || $rdf.sym(`http://example.org/model/${safeSlug}`);

      // Ensure type triple
      if (!existingOntology) {
        store.add(subj as any, RDF('type') as any, OWL('Ontology') as any);
      }

      // Ensure label
      const hasLabel = store.any(subj as any, RDFS('label') as any, undefined as any);
      if (!hasLabel && name) {
        store.add(subj as any, RDFS('label') as any, $rdf.literal(name) as any);
      }

      // Ensure description (prefer dcterms:description)
      const hasDesc = store.any(subj as any, DCTERMS('description') as any, undefined as any);
      if (!hasDesc && description) {
        store.add(subj as any, DCTERMS('description') as any, $rdf.literal(description) as any);
      }

      const serialized = $rdf.serialize(undefined as any, store, base, 'text/turtle') as unknown as string;
      return serialized || ttl;
    } catch (e) {
      console.warn('Failed to add owl:Ontology to TTL; returning original TTL', e);
      // Fallback: append a minimal ontology block using the name as a subject slug
      const safeName = (name || 'model').toString().replace(/[^\w\-]+/g, '_');
      const desc = (description || '').toString().replace(/"/g, '\\"');
      const block = `
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix dcterms: <http://purl.org/dc/terms/> .

<http://example.org/model/${safeName}> a owl:Ontology ;
  rdfs:label "${name}" ;
  dcterms:description "${desc}" .
`;
      return ttl + '\n\n' + block;
    }
  }


  sendFile() {
    if (!this.pointListCSV) return;
    this.modelGenerationService.sendFile(this.pointListCSV, this.demoStateService.getParserSourcePy()).subscribe({
      next: (data) => {
        this.turtleString = data.model;
        if (this.turtleString) {
          this.parseTurtleString(this.turtleString);
        }
        console.log('File processed successfully', data);
      },
      error: (error) => {
        console.error('Error processing file', error);
      }
    });
  }

  saveModel() {
    const name = this.saveModelForm.value.nameControl as string | null;
    const description = this.saveModelForm.value.descriptionControl as string | null;

    if (!name || !this.turtleString) return;

    // Ensure the generated TTL has an owl:Ontology with label/description
    const ttlWithOntology = this.addOntologyToTTL(name, description || '', this.turtleString);
    // Update local state so the UI reflects the augmented TTL
    this.turtleString = ttlWithOntology;

    this.modelNewService.createModel(name, description || '').subscribe({
      next: (newModel) => {
        this._snackBar.open('Model saved successfully!', 'Close', {
          duration: 3000,
        });
        this.modelDetailService.updateModelGraph(newModel.id, ttlWithOntology).subscribe({
          next: (data: string) => {
            console.log('Updated model graph:', data);
          },
          error: (error) => {
            console.error('Error updating model graph:', error);
          },
        });
        // navigate to the new model
        //this.router.navigate(['/model', newModel.id]);
      },
      error: (error) => {
        this._snackBar.open('Error saving model: ' + error, 'Close', {
          duration: 3000,
        });
      },
    });
  }
}
