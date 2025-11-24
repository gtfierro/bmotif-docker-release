import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { LibraryCreateService } from './library-create.service';

@Component({
  selector: 'app-library-new',
  templateUrl: './library-new.component.html',
  styleUrls: ['./library-new.component.css'],
  providers: [LibraryCreateService]
})
export class LibraryNewComponent {
  // TTL flow
  ttlFile: File | null = null;
  ttlName: string = '';
  creatingFromTTL = false;

  // Rules flow
  rulesFile: File | null = null;
  rulesName: string = '';
  creatingFromRules = false;

  constructor(
    private router: Router,
    private snackBar: MatSnackBar,
    private creator: LibraryCreateService
  ) {}

  // Helpers
  private openSnackBar(message: string): void {
    this.snackBar.open(message, 'close', { duration: 2500 });
  }

  private deriveNameFromFilename(file: File): string {
    const n = file.name;
    const dot = n.lastIndexOf('.');
    return dot > 0 ? n.slice(0, dot) : n;
  }

  private async deriveNameFromTTL(file: File): Promise<string> {
    try {
      const text = await file.text();
      // Try to find an rdfs:label first
      const labelMatch = text.match(/rdfs:label\s+"([^"]+)"/i);
      if (labelMatch && labelMatch[1]) {
        return labelMatch[1];
      }
      // Try to find owl:Ontology ... rdfs:label "..."
      const ontologyLabel = text.match(/owl:Ontology[\s\S]*?rdfs:label\s+"([^"]+)"/i);
      if (ontologyLabel && ontologyLabel[1]) {
        return ontologyLabel[1];
      }
      // Try to infer from @base or first URI local name
      const baseMatch = text.match(/@base\s+<([^>]+)>/i) || text.match(/@prefix\s+\w+:\s*<([^>]+)>/i);
      if (baseMatch && baseMatch[1]) {
        const url = baseMatch[1].replace(/[#/]+$/, '');
        const parts = url.split(/[#/]/);
        const last = parts[parts.length - 1];
        if (last) return last;
      }
      // Fallback to filename
      return this.deriveNameFromFilename(file);
    } catch {
      return this.deriveNameFromFilename(file);
    }
  }

  // TTL flow
  async onTTLFileSelected(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.ttlFile = file;
    if (file) {
      const derived = await this.deriveNameFromTTL(file);
      this.ttlName = derived || this.deriveNameFromFilename(file);
    } else {
      this.ttlName = '';
    }
  }

  createFromTTL(): void {
    if (!this.ttlFile) {
      this.openSnackBar('Please choose a TTL file.');
      return;
    }
    const name = (this.ttlName || this.deriveNameFromFilename(this.ttlFile)).trim();
    if (!name) {
      this.openSnackBar('Please provide a library name.');
      return;
    }
    this.creatingFromTTL = true;
    this.creator.createFromTTL(this.ttlFile, name).subscribe({
      next: (res) => {
        this.openSnackBar(`Created library: ${res?.name || name}`);
        this.router.navigate(['/libraries']);
      },
      error: (err) => {
        console.error('Failed to create library from TTL', err);
        this.openSnackBar('Error creating library from TTL');
      },
      complete: () => {
        this.creatingFromTTL = false;
      }
    });
  }

  // Rules flow
  onRulesFileSelected(event: Event): void {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.rulesFile = file;
    if (file) {
      const derived = this.deriveNameFromFilename(file);
      if (!this.rulesName) {
        this.rulesName = derived;
      }
    } else {
      this.rulesName = '';
    }
  }

  createFromRules(): void {
    if (!this.rulesFile) {
      this.openSnackBar('Please choose a rules JSON file.');
      return;
    }
    const name = (this.rulesName || this.deriveNameFromFilename(this.rulesFile)).trim();
    this.creatingFromRules = true;
    this.creator.createFromRules(this.rulesFile, name).subscribe({
      next: (res) => {
        const libName = res?.library || name;
        this.openSnackBar(`Created rules library: ${libName}`);
        this.router.navigate(['/libraries']);
      },
      error: (err) => {
        console.error('Failed to create library from rules', err);
        this.openSnackBar('Error creating library from rules');
      },
      complete: () => {
        this.creatingFromRules = false;
      }
    });
  }
}
