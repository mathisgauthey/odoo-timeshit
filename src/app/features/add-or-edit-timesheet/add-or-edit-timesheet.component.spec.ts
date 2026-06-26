import {ComponentFixture, TestBed} from '@angular/core/testing';

import {AddOrEditTimesheetComponent} from './add-or-edit-timesheet.component';

describe('AddOrEditTimesheetComponent', () => {
  let component: AddOrEditTimesheetComponent;
  let fixture: ComponentFixture<AddOrEditTimesheetComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddOrEditTimesheetComponent]
    })
      .compileComponents();

    fixture = TestBed.createComponent(AddOrEditTimesheetComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
