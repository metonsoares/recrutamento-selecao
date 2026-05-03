export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'scale'
  | 'open_text'
  | 'number'

export type SurveyStatus = 'draft' | 'active' | 'closed'

export interface Database {
  public: {
    Tables: {
      surveys: {
        Row: {
          id: string
          title: string
          description: string | null
          status: SurveyStatus
          created_at: string
        }
        Insert: {
          id?: string
          title: string
          description?: string | null
          status?: SurveyStatus
          created_at?: string
        }
        Update: {
          id?: string
          title?: string
          description?: string | null
          status?: SurveyStatus
          created_at?: string
        }
        Relationships: []
      }
      survey_sections: {
        Row: {
          id: string
          survey_id: string
          title: string
          description: string | null
          display_order: number
        }
        Insert: {
          id?: string
          survey_id: string
          title: string
          description?: string | null
          display_order: number
        }
        Update: {
          id?: string
          survey_id?: string
          title?: string
          description?: string | null
          display_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'survey_sections_survey_id_fkey'
            columns: ['survey_id']
            isOneToOne: false
            referencedRelation: 'surveys'
            referencedColumns: ['id']
          }
        ]
      }
      questions: {
        Row: {
          id: string
          survey_id: string
          section_id: string
          question_text: string
          question_type: QuestionType
          is_required: boolean
          max_choices: number | null
          display_order: number
        }
        Insert: {
          id?: string
          survey_id: string
          section_id: string
          question_text: string
          question_type: QuestionType
          is_required?: boolean
          max_choices?: number | null
          display_order: number
        }
        Update: {
          id?: string
          survey_id?: string
          section_id?: string
          question_text?: string
          question_type?: QuestionType
          is_required?: boolean
          max_choices?: number | null
          display_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'questions_survey_id_fkey'
            columns: ['survey_id']
            isOneToOne: false
            referencedRelation: 'surveys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'questions_section_id_fkey'
            columns: ['section_id']
            isOneToOne: false
            referencedRelation: 'survey_sections'
            referencedColumns: ['id']
          }
        ]
      }
      question_options: {
        Row: {
          id: string
          question_id: string
          option_text: string
          display_order: number
        }
        Insert: {
          id?: string
          question_id: string
          option_text: string
          display_order: number
        }
        Update: {
          id?: string
          question_id?: string
          option_text?: string
          display_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'question_options_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          }
        ]
      }
      respondents: {
        Row: {
          id: string
          survey_id: string
          name: string
          role: string
          created_at: string
        }
        Insert: {
          id?: string
          survey_id: string
          name: string
          role: string
          created_at?: string
        }
        Update: {
          id?: string
          survey_id?: string
          name?: string
          role?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'respondents_survey_id_fkey'
            columns: ['survey_id']
            isOneToOne: false
            referencedRelation: 'surveys'
            referencedColumns: ['id']
          }
        ]
      }
      responses: {
        Row: {
          id: string
          survey_id: string
          respondent_id: string
          submitted_at: string
        }
        Insert: {
          id?: string
          survey_id: string
          respondent_id: string
          submitted_at?: string
        }
        Update: {
          id?: string
          survey_id?: string
          respondent_id?: string
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'responses_survey_id_fkey'
            columns: ['survey_id']
            isOneToOne: false
            referencedRelation: 'surveys'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'responses_respondent_id_fkey'
            columns: ['respondent_id']
            isOneToOne: true
            referencedRelation: 'respondents'
            referencedColumns: ['id']
          }
        ]
      }
      answers: {
        Row: {
          id: string
          response_id: string
          question_id: string
          option_id: string | null
          answer_text: string | null
          answer_number: number | null
        }
        Insert: {
          id?: string
          response_id: string
          question_id: string
          option_id?: string | null
          answer_text?: string | null
          answer_number?: number | null
        }
        Update: {
          id?: string
          response_id?: string
          question_id?: string
          option_id?: string | null
          answer_text?: string | null
          answer_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: 'answers_response_id_fkey'
            columns: ['response_id']
            isOneToOne: false
            referencedRelation: 'responses'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'answers_question_id_fkey'
            columns: ['question_id']
            isOneToOne: false
            referencedRelation: 'questions'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'answers_option_id_fkey'
            columns: ['option_id']
            isOneToOne: false
            referencedRelation: 'question_options'
            referencedColumns: ['id']
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Tipos auxiliares para uso no app
export type Survey = Database['public']['Tables']['surveys']['Row']
export type SurveySection = Database['public']['Tables']['survey_sections']['Row']
export type Question = Database['public']['Tables']['questions']['Row']
export type QuestionOption = Database['public']['Tables']['question_options']['Row']
export type Respondent = Database['public']['Tables']['respondents']['Row']
export type Response = Database['public']['Tables']['responses']['Row']
export type Answer = Database['public']['Tables']['answers']['Row']

// Tipos compostos para o formulário
export interface SectionWithQuestions extends SurveySection {
  questions: QuestionWithOptions[]
}

export interface QuestionWithOptions extends Question {
  question_options: QuestionOption[]
}

export interface SurveyWithSections extends Survey {
  survey_sections: SectionWithQuestions[]
}

// Tipo para submissão de resposta
export interface AnswerSubmission {
  question_id: string
  option_ids?: string[]       // para single_choice, multiple_choice e scale
  answer_text?: string        // para open_text
  answer_number?: number      // para number e scale
}

export interface ResponseSubmission {
  survey_id: string
  respondent_id: string
  answers: AnswerSubmission[]
}
