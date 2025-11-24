import { NgModule, NO_ERRORS_SCHEMA } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { RulesComponent } from './rules/rules.component';
import { PointListToTemplateComponent } from './point-list-to-template/point-list-to-template.component';
import { NamingComponent } from './naming/naming.component';
import { PointLabelParserComponent } from './point-label-parser/point-label-parser.component';
import { PointListService } from './point-list-to-template/point-list-to-template.service';
import { MatIconModule } from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatTabsModule} from '@angular/material/tabs';
import {MatTableModule} from '@angular/material/table';
import {MatCardModule} from '@angular/material/card';
import {MatSidenavModule} from '@angular/material/sidenav';
import {MatExpansionModule} from '@angular/material/expansion';
import {MatGridListModule} from '@angular/material/grid-list';
import {MatDialogModule} from '@angular/material/dialog';
import {MatStepperModule} from '@angular/material/stepper';
import {MatDividerModule} from '@angular/material/divider';
import {MatListModule} from '@angular/material/list';
import {MatProgressBarModule} from '@angular/material/progress-bar';
import {MatAutocompleteModule} from '@angular/material/autocomplete';
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from '@angular/material/input';
import {MatToolbarModule} from '@angular/material/toolbar';
import { CodemirrorModule } from '@ctrl/ngx-codemirror';
import { MatSortModule } from '@angular/material/sort';
import {MatSnackBarModule} from '@angular/material/snack-bar';
import {MatSelectModule} from '@angular/material/select';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';

import { ParserVisComponent } from './parser-vis/parser-vis.component';
import { DemoStateService } from './demostate.service';
import {HomeComponent} from './home/home.component';
import { LibraryComponent } from './library/library.component';
import { LibraryService } from './library/library.service';
import { ShapeValidationComponent } from './shape-validation/shape-validation.component';


import { ModelGenerationComponent } from './model-generation/model-generation.component';
import { ModelGenerationService } from './model-generation/model-generation.service';
import { ModelDetailComponent } from './model-detail/model-detail.component';
import { ModelValidateService } from './model-validate/model-validate.service';
import { ModelNewComponent } from './model-new/model-new.component';
import { ModelSearchComponent } from './model-search/model-search.component';
import { ModelValidateComponent } from './model-validate/model-validate.component';
import { ModelNetworkComponent } from './model-network/model-network.component';

import { ManifestGenerateComponent } from './manifest-generate/manifest-generate.component';
import { ModelValidateLibraryComponent } from './model-validate-library/model-validate-library.component';
import { TemplateEvaluateFormComponent } from './template-evaluate/template-evaluate-form/template-evaluate-form.component';
import { TemplateEvaluateResultComponent } from './template-evaluate/template-evaluate-result/template-evaluate-result.component';
import { TemplateEvaluateComponent} from './template-evaluate/template-evaluate.component'
import { PointLabelCheckerComponent } from './point-label-checker/point-label-checker.component';
import { TemplateDetailService } from './template-detail/template-detail.service';
import { TemplateDetailComponent } from './template-detail/template-detail.component';
import { TemplateSearchComponent } from './template-search/template-search.component';
import { TemplateNetworkComponent } from './template-network/template-network.component';
import { MappingComponent } from './mapping/mapping.component';
import { LibraryDetailComponent } from './library-detail/library-detail.component';
import { LibraryNewComponent } from './library-new/library-new.component';
import { MappingService } from './mapping/mapping.service';
import { TemplateEvaluateService } from './template-evaluate/template-evaluate.service';
import { ModelValidateTemplatesComponent } from './model-validate-templates/model-validate-templates.component';

@NgModule({
  declarations: [
    AppComponent,
    LibraryComponent,
    LibraryDetailComponent,
    LibraryNewComponent,
    RulesComponent,
    NamingComponent,
    PointListToTemplateComponent,
    ModelGenerationComponent,
    ShapeValidationComponent,
    ParserVisComponent,
    HomeComponent,

    ModelDetailComponent,
    ModelNewComponent,
    ModelSearchComponent,
    ModelValidateComponent,
    ModelValidateTemplatesComponent,

    TemplateEvaluateComponent,
    TemplateEvaluateFormComponent,
    TemplateEvaluateResultComponent,
    TemplateDetailComponent,
    TemplateSearchComponent,
    TemplateNetworkComponent,
    ModelNetworkComponent,
    ManifestGenerateComponent,
    ModelValidateLibraryComponent,
    PointLabelCheckerComponent,
    PointLabelParserComponent,
    MappingComponent,
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    CodemirrorModule,

    // material stuff
    MatTableModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    MatCheckboxModule,
    MatButtonModule,
    MatTabsModule,
    MatDividerModule,
    MatListModule,
    MatProgressBarModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSidenavModule,
    MatDialogModule,
    MatStepperModule,
    MatGridListModule,
    MatToolbarModule,
    MatButtonModule,
    MatSnackBarModule,
    MatCardModule,
    MatSortModule,
  ],
  providers: [PointListService, ModelGenerationService, ModelGenerationService, DemoStateService, LibraryService, TemplateDetailService, ModelValidateService, TemplateEvaluateService, MappingService],
  bootstrap: [AppComponent],
  schemas: [NO_ERRORS_SCHEMA]
})
export class AppModule { }
