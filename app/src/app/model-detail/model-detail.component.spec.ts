import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';

import { ModelDetailComponent } from './model-detail.component';
import { ModelDetailService } from './model-detail.service';

describe('ModelDetailComponent', () => {
  let component: ModelDetailComponent;
  let fixture: ComponentFixture<ModelDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ModelDetailComponent ],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {
                ModelDetailResolver: [
                  { id: 1, name: 'Test Model', graph_id: 1, description: 'desc' },
                  '<graph/>',
                  '<manifest/>'
                ]
              }
            }
          }
        },
        {
          provide: ModelDetailService,
          useValue: {
            getAllLibraries: () => of([]),
            getManifestLibraries: (_id: number) => of([]),
            updateModelGraph: (_id: number, _graph: string | File) => of('<graph/>'),
            getModel: (_id: number) => of({ id: 1, name: 'Test Model', graph_id: 1, description: 'desc' }),
            getModelGraph: (_id: number) => of('<graph/>'),
            getManifest: (_id: number) => of('<manifest/>'),
            getLibrarysTemplates: (_libId: number) => of({ id: 1, name: 'Lib', shape_collection_id: 1, templates: [] })
          }
        },
        { provide: MatSnackBar, useValue: { open: () => {} } },
        { provide: MatDialog, useValue: { open: () => {} } },
      ],
      schemas: [NO_ERRORS_SCHEMA]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ModelDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
